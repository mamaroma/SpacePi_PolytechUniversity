"""
Загрузка фотоархива (папки «Полярные фотографии» и «Фотографии с КА»)
в бакет Yandex Cloud Object Storage и формирование манифеста для фронта.

Креды и имя бакета берём из .env проекта:
  YC_S3_ACCESS_KEY
  YC_S3_SECRET_KEY
  YC_S3_BUCKET
  YC_S3_ENDPOINT_URL  (по умолчанию https://storage.yandexcloud.net)

Запуск из корня проекта:
  python -m scripts.upload_snapshots_to_yc
  python scripts/upload_snapshots_to_yc.py
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Iterable

import boto3
from botocore.client import Config
from botocore.exceptions import BotoCoreError, ClientError
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env", override=False)

ACCESS_KEY = os.getenv("YC_S3_ACCESS_KEY", "").strip()
SECRET_KEY = os.getenv("YC_S3_SECRET_KEY", "").strip()
BUCKET = os.getenv("YC_S3_BUCKET", "space-pi-bucket").strip()
ENDPOINT = os.getenv("YC_S3_ENDPOINT_URL", "https://storage.yandexcloud.net").strip()
REGION = os.getenv("YC_S3_REGION", "ru-central1").strip()

# Префикс «папки» в бакете под все снимки
ROOT_PREFIX = "snapshots"

# Локальные папки с фото и их соответствие категориям
LOCAL_ROOTS = {
    "Полярные фотографии": "polar",      # категория для фронта
    "Фотографии с КА":     "spacecraft",
}

# Координаты центров регионов (расставляем точки разумно по миру).
# Для каждой региональной папки делаем небольшой разброс, чтобы
# одинаковые точки не накладывались друг на друга на карте.
REGION_COORDS: dict[str, tuple[float, float]] = {
    # Полярные
    "Аляска":               (64.2,  -150.4),
    "Антарктида":           (-78.5,    30.0),
    "Гренландия":           (72.0,   -38.5),
    "Новая земля":          (74.5,    56.0),
    "Нуук Гренландия":      (64.18,  -51.75),
    "Осло":                 (59.91,   10.75),
    "Северодвинск":         (64.56,   39.83),
    "Среднеколымск":        (67.45,  153.71),
    "Чукотка":              (67.0,  -174.5),
    # КА
    "SCST-2.11":            (55.75,   37.62),
    "ПЮ-4":                 (60.01,   30.38),
    # «Фотографии с КА» в корне → раскидаем как «общая орбита»
    "Фотографии с КА":      (40.0,    50.0),
}

# Строки на латинице для имён в бакете
TRANSLIT = {
    "А":"A","Б":"B","В":"V","Г":"G","Д":"D","Е":"E","Ё":"E","Ж":"Zh","З":"Z","И":"I",
    "Й":"Y","К":"K","Л":"L","М":"M","Н":"N","О":"O","П":"P","Р":"R","С":"S","Т":"T",
    "У":"U","Ф":"F","Х":"H","Ц":"Ts","Ч":"Ch","Ш":"Sh","Щ":"Sch","Ъ":"","Ы":"Y","Ь":"",
    "Э":"E","Ю":"Yu","Я":"Ya",
    "а":"a","б":"b","в":"v","г":"g","д":"d","е":"e","ё":"e","ж":"zh","з":"z","и":"i",
    "й":"y","к":"k","л":"l","м":"m","н":"n","о":"o","п":"p","р":"r","с":"s","т":"t",
    "у":"u","ф":"f","х":"h","ц":"ts","ч":"ch","ш":"sh","щ":"sch","ъ":"","ы":"y","ь":"",
    "э":"e","ю":"yu","я":"ya",
}

def slugify(s: str) -> str:
    if not s:
        return ""
    out = "".join(TRANSLIT.get(ch, ch) for ch in s)
    out = re.sub(r"[^A-Za-z0-9._-]+", "_", out)
    out = re.sub(r"_+", "_", out).strip("_-.")
    return out.lower() or "file"


def jitter(idx: int, max_offset: float = 2.5) -> float:
    """Простой детерминированный «разброс» точек по широте/долготе,
    чтобы они не накладывались. ±max_offset градусов."""
    # Чередуем по индексу
    seq = [-2, 1, -1, 2, -3, 0, 3, -1.5, 1.5, -2.5, 2.5]
    v = seq[idx % len(seq)]
    return v * (max_offset / 3.0)


def make_s3_client():
    if not ACCESS_KEY or not SECRET_KEY:
        sys.exit("ERROR: YC_S3_ACCESS_KEY/YC_S3_SECRET_KEY не заданы в .env")
    return boto3.client(
        "s3",
        endpoint_url=ENDPOINT,
        aws_access_key_id=ACCESS_KEY,
        aws_secret_access_key=SECRET_KEY,
        region_name=REGION,
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


def iter_local_files() -> Iterable[tuple[Path, str, str]]:
    """
    Перебирает все локальные файлы и возвращает кортежи:
      (local_path, category, region)
    """
    for top_name, category in LOCAL_ROOTS.items():
        top = PROJECT_ROOT / top_name
        if not top.is_dir():
            print(f"  ⚠ Каталог не найден: {top}")
            continue

        # 1) файлы в корне категории
        for f in sorted(top.iterdir()):
            if f.is_file() and f.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}:
                yield f, category, top_name  # регион = верхний каталог

        # 2) файлы во вложенных подпапках (регионах)
        for sub in sorted(p for p in top.iterdir() if p.is_dir()):
            for f in sorted(sub.iterdir()):
                if f.is_file() and f.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}:
                    yield f, category, sub.name


def upload_one(s3, local: Path, category: str, region: str) -> tuple[str, str]:
    """Возвращает (object_key, public_url)."""
    region_slug = slugify(region)
    file_slug = slugify(local.stem) + local.suffix.lower()
    key = f"{ROOT_PREFIX}/{category}/{region_slug}/{file_slug}"
    extra = {
        "ACL": "public-read",
        "ContentType": guess_mime(local.suffix.lower()),
    }
    s3.upload_file(str(local), BUCKET, key, ExtraArgs=extra)
    public = f"{ENDPOINT}/{BUCKET}/{key}"
    return key, public


def guess_mime(ext: str) -> str:
    return {
        ".jpg":  "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png":  "image/png",
        ".webp": "image/webp",
    }.get(ext, "application/octet-stream")


def main() -> None:
    s3 = make_s3_client()
    print(f"→ Бакет: {BUCKET}  ({ENDPOINT})")
    print(f"→ Префикс: {ROOT_PREFIX}/")

    snapshots: list[dict] = []
    by_region_idx: dict[str, int] = {}
    total_ok = 0
    total_err = 0

    for idx, (local, category, region) in enumerate(iter_local_files()):
        try:
            key, public = upload_one(s3, local, category, region)
            total_ok += 1
            print(f"  ✓ {category}/{region}/{local.name}")

            base = REGION_COORDS.get(region, REGION_COORDS.get(region.strip(), (40.0, 50.0)))
            i = by_region_idx.get(region, 0)
            by_region_idx[region] = i + 1
            lat = base[0] + jitter(i, max_offset=1.6)
            lon = base[1] + jitter(i + 3, max_offset=2.2)

            folder_label = "Полярные фотографии" if category == "polar" else "Фотографии с КА"
            snapshots.append({
                "id":     f"{slugify(region)}-{i}",
                "folder": folder_label,
                "title":  f"{region} · {local.stem[:42]}",
                "region": region,
                "lat":    round(lat, 4),
                "lon":    round(lon, 4),
                "file":   key,                # object key в бакете
                "url":    public,             # прямая публичная ссылка
                "size":   local.stat().st_size,
            })
        except (BotoCoreError, ClientError, OSError) as exc:
            total_err += 1
            print(f"  × ОШИБКА: {local.name}: {exc}")

    out = PROJECT_ROOT / "ui" / "public" / "snapshots-manifest.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({
        "bucket":   BUCKET,
        "endpoint": ENDPOINT,
        "root":     ROOT_PREFIX,
        "count":    len(snapshots),
        "items":    snapshots,
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\n→ Манифест: {out}  ({len(snapshots)} снимков)")
    print(f"→ Загружено: {total_ok},  ошибок: {total_err}")


if __name__ == "__main__":
    main()
