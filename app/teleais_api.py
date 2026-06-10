"""
Архивные данные tele-ais — реальные CSV-файлы с орбиты, которые мы
закачали на сервер и храним в  /opt/spacepi/tele-ais_data  (на сервере)
или в  ./tele-ais_data  (в дев-сборке). Путь конфигурируется через
переменную окружения  TELEAIS_DATA_DIR.

Структура каталога:
    tele-ais_data/
      ├── telemetry/                 # один CSV на спутник
      │   ├── pu-1.csv
      │   ├── pu-3.csv               # PU-2 НЕТ — синтезируем из PU-1
      │   ├── pu-4.csv
      │   ├── pu-5.csv
      │   └── pu-6.csv
      └── ais/
          └── 2025.02.08_CSTP-2.1, АИС, Арктика (1884)/
              └── *.csv

В этом файле — три набора эндпоинтов:

  • /api/teleais/telemetry  — телеметрия (список, скачивание).
  • /api/teleais/ais        — AIS-сессии (список, скачивание, точки на карту).
  • /api/teleais/ais/points — агрегированные позиции для интерактивной карты.

PU-2 — особый случай. Спутник был утерян 18.10.2024, но реальной телеметрии
по нему у нас нет. По требованию пользователя мы фальсифицируем её
из PU-1, ограничивая дату до 17.10.2024 и добавляя небольшой
детерминированный шум (чтобы числа отличались от PU-1).
"""
from __future__ import annotations

import csv
import io
import os
import re
import json
import math
import time
import random
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, Response

router = APIRouter(prefix="/api/teleais", tags=["teleais"])

# ── Корневой каталог архива ────────────────────────────────────────────────────
_DEFAULT_ROOT = Path(__file__).resolve().parent.parent / "tele-ais_data"
ROOT = Path(os.environ.get("TELEAIS_DATA_DIR", str(_DEFAULT_ROOT)))

# Кеш для синтезированного PU-2 (чтобы не пересчитывать каждый запрос)
_CACHE_DIR = Path(__file__).resolve().parent.parent / "data" / "teleais_cache"
_CACHE_DIR.mkdir(parents=True, exist_ok=True)

# ── Список спутников телеметрии ───────────────────────────────────────────────
# Карточки: какой файл читать + фолбэк PU-2. Для PU-2 источник — PU-1,
# но обрезанный до дня выхода из строя 18.10.2024 (используем 17.10.2024
# 23:59 для гарантии).
PU2_CUTOFF = datetime(2024, 10, 17, 23, 59, 59, tzinfo=timezone.utc)

SATELLITE_FILES = {
    "PU-1": {"file": "pu-1.csv", "label": "Polytech Universe-1"},
    "PU-2": {"file": None,        "label": "Polytech Universe-2", "synthetic_from": "PU-1"},
    "PU-3": {"file": "pu-3.csv", "label": "Polytech Universe-3"},
    "PU-4": {"file": "pu-4.csv", "label": "Polytech Universe-4"},
    "PU-5": {"file": "pu-5.csv", "label": "Polytech Universe-5"},
    "PU-6": {"file": "pu-6.csv", "label": "Polytech Universe-6"},
}


# ── helpers ────────────────────────────────────────────────────────────────────
def _tele_path(name: str) -> Path:
    return ROOT / "telemetry" / name


def _stat_info(p: Path) -> dict:
    st = p.stat()
    return {
        "size_bytes": st.st_size,
        "mtime_iso": datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat(),
    }


# ── PU-2 синтез ────────────────────────────────────────────────────────────────
# Формат файла PU-1 (псевдокод):
#   "TOA(UTC+3);RTC;...;System Bus Voltage [mV];System Bus Current [mA];BA Charge [mA/h];..."
# Разделитель — `;`. Заголовок — первая строка. Числовые поля будем чуть-чуть
# «шевелить», чтобы PU-2 не повторял PU-1 один в один (требование задачи).

_PU1_DATE_FMT = "%d.%m.%Y %H:%M"

# Поля, по которым допустимо вносить лёгкую вариацию. Все эти поля
# распознаются по подстроке в заголовке (case-insensitive), чтобы
# не привязываться к точным названиям.
_NOISY_FIELDS_PATTERNS = [
    ("system bus voltage", 60),     # ±60 mV
    ("system bus current", 25),     # ±25 mA
    ("ba charge",          18),     # ±18 mA/h
    ("current on",         8),      # ±8  mA
    ("temp ba",            1),      # ±1  °C
    ("current from sp",    20),     # ±20 mA
    ("bus voltage sp",     35),     # ±35 mV
    ("ba charge %",        2),      # ±2  %
]


def _pu1_parse_date(s: str) -> Optional[datetime]:
    s = s.strip().strip('"')
    if not s:
        return None
    try:
        # данные в UTC+3, приводим к UTC для сравнения
        dt = datetime.strptime(s, _PU1_DATE_FMT)
        # UTC = local - 3h
        return dt.replace(tzinfo=timezone(__import__("datetime").timedelta(hours=3))).astimezone(timezone.utc)
    except Exception:
        return None


def _synthesize_pu2_csv() -> bytes:
    """
    Берём pu-1.csv, фильтруем по дате <= PU2_CUTOFF, в избранных колонках
    добавляем небольшой шум с фиксированным сидом. Результат — байтовый
    CSV в той же форме (`;` разделитель, заголовок сохраняем).
    """
    src = _tele_path("pu-1.csv")
    if not src.exists():
        raise HTTPException(503, "Source pu-1.csv not found — cannot synthesize PU-2")

    # Read raw bytes; PU-1 содержит «битые» символы в кириллице (см. R�2), так
    # что декодируем как latin-1 — позиции байт остаются правильными.
    text = src.read_text(encoding="latin-1")
    lines = text.splitlines()
    if not lines:
        return b""

    header_line = lines[0]
    header = header_line.split(";")
    header_lower = [h.lower() for h in header]

    def _col_jitter(col_idx: int) -> Optional[int]:
        h = header_lower[col_idx]
        for pat, jitter in _NOISY_FIELDS_PATTERNS:
            if pat in h:
                return jitter
        return None

    # Для каждой строки — детерминированный RNG (сид = индекс),
    # чтобы данные были стабильны между запросами.
    out_lines = [header_line]
    skipped = 0
    for idx, line in enumerate(lines[1:], start=1):
        if not line.strip():
            continue
        fields = line.split(";")
        if len(fields) < 2:
            continue

        ts = _pu1_parse_date(fields[0])
        if ts is None or ts > PU2_CUTOFF:
            skipped += 1
            continue

        rng = random.Random(idx * 37 + 911)
        out_fields = list(fields)
        for col_idx in range(len(fields)):
            jitter = _col_jitter(col_idx)
            if jitter is None:
                continue
            val_str = fields[col_idx].strip()
            if not val_str:
                continue
            try:
                v = int(val_str)
                delta = rng.randint(-jitter, jitter)
                out_fields[col_idx] = str(max(0, v + delta) if v >= 0 else v + delta)
            except ValueError:
                try:
                    v = float(val_str)
                    delta = (rng.random() - 0.5) * 2 * jitter
                    out_fields[col_idx] = f"{v + delta:.2f}"
                except ValueError:
                    pass
        out_lines.append(";".join(out_fields))

    return ("\r\n".join(out_lines) + "\r\n").encode("latin-1", errors="replace")


def _pu2_cached() -> Path:
    cache = _CACHE_DIR / "pu-2.csv"
    src = _tele_path("pu-1.csv")
    # Рекеш если исходник новее кеша
    if cache.exists() and src.exists():
        if cache.stat().st_mtime >= src.stat().st_mtime:
            return cache
    cache.write_bytes(_synthesize_pu2_csv())
    return cache


# ── Telemetry endpoints ────────────────────────────────────────────────────────
@router.get("/telemetry/list")
def telemetry_list() -> dict:
    items = []
    for code, meta in SATELLITE_FILES.items():
        if meta.get("synthetic_from"):
            # синтетический файл — отдадим расчётный размер
            try:
                p = _pu2_cached()
                info = _stat_info(p)
            except HTTPException:
                info = {"size_bytes": 0, "mtime_iso": None}
            items.append({
                "code": code,
                "label": meta["label"],
                "filename": "pu-2.csv",
                "synthetic": True,
                "source": meta["synthetic_from"],
                **info,
            })
        else:
            p = _tele_path(meta["file"])
            if not p.exists():
                items.append({
                    "code": code,
                    "label": meta["label"],
                    "filename": meta["file"],
                    "synthetic": False,
                    "size_bytes": 0,
                    "mtime_iso": None,
                    "missing": True,
                })
                continue
            items.append({
                "code": code,
                "label": meta["label"],
                "filename": meta["file"],
                "synthetic": False,
                **_stat_info(p),
            })
    return {"items": items}


@router.get("/telemetry/download")
def telemetry_download(sat: str = Query(..., description="PU-1 … PU-6")):
    sat = sat.upper().strip()
    if sat not in SATELLITE_FILES:
        raise HTTPException(404, f"Unknown satellite: {sat}")
    meta = SATELLITE_FILES[sat]

    if meta.get("synthetic_from"):
        p = _pu2_cached()
        return FileResponse(
            str(p),
            media_type="text/csv; charset=latin-1",
            filename="pu-2.csv",
        )

    p = _tele_path(meta["file"])
    if not p.exists():
        raise HTTPException(404, f"File not found for {sat}")
    return FileResponse(str(p), media_type="text/csv", filename=meta["file"])


# ── AIS endpoints ──────────────────────────────────────────────────────────────
#
# Распознавание спутника по имени папки сессии. Слово в названии вида
# `CSTP-2.1`, `CSTP-2.2`, `PU-4`/`PU4` → код спутника.
# Подчёркивание считается «буквой» в \b, поэтому используем явный
# «не-цифровой» хвостовой ассерт: spacecraft-код заканчивается, если
# следом не идёт цифра (CSTP-2.10 матчим отдельно перед CSTP-2.1).
_SAT_PATTERNS = [
    (re.compile(r"CSTP[-_ ]?2\.10(?!\d)", re.IGNORECASE), "CSTP-2.10"),
    (re.compile(r"CSTP[-_ ]?2\.1(?!\d)",  re.IGNORECASE), "CSTP-2.1"),
    (re.compile(r"CSTP[-_ ]?2\.2(?!\d)",  re.IGNORECASE), "CSTP-2.2"),
    (re.compile(r"PU[-_ ]?4(?!\d)",        re.IGNORECASE), "PU-4"),
]


def _detect_sat(folder_name: str) -> str:
    for rx, code in _SAT_PATTERNS:
        if rx.search(folder_name):
            return code
    return "unknown"


def _ais_root() -> Path:
    p = ROOT / "ais"
    if not p.exists():
        raise HTTPException(503, f"AIS data directory not mounted: {p}")
    return p


def _iter_ais_files():
    """Возвращает кортежи (relative_path, satellite_code, abs_path)."""
    root = _ais_root()
    for session_dir in sorted(root.iterdir()):
        if not session_dir.is_dir():
            continue
        sat = _detect_sat(session_dir.name)
        for f in session_dir.rglob("*.csv"):
            rel = f.relative_to(root)
            yield rel, sat, f


@router.get("/ais/list")
def ais_list():
    """Список всех CSV-сессий. Сортировка — по убыванию даты (новые сверху)."""
    items = []
    for rel, sat, f in _iter_ais_files():
        st = f.stat()
        # Дата извлекается из префикса папки  2025.02.08_...
        folder = rel.parts[0]
        m = re.match(r"(\d{4})\.(\d{2})\.(\d{2})", folder)
        session_date = f"{m.group(1)}-{m.group(2)}-{m.group(3)}" if m else None

        items.append({
            "path": str(rel).replace("\\", "/"),
            "session": folder,
            "satellite": sat,
            "filename": f.name,
            "session_date": session_date,
            "size_bytes": st.st_size,
            "mtime_iso": datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat(),
        })

    # сортируем: сначала по дате сессии (DESC), потом по имени файла
    items.sort(key=lambda x: (x["session_date"] or "", x["filename"]), reverse=True)
    return {"items": items}


@router.get("/ais/download")
def ais_download(path: str = Query(..., description="relative path inside ais/")):
    root = _ais_root()
    # защищаемся от path-traversal
    safe = Path(path).as_posix().replace("\\", "/")
    if ".." in safe.split("/"):
        raise HTTPException(400, "Bad path")
    p = (root / safe).resolve()
    try:
        p.relative_to(root.resolve())
    except ValueError:
        raise HTTPException(400, "Path outside ais root")
    if not p.is_file():
        raise HTTPException(404, "Not found")
    return FileResponse(str(p), media_type="text/csv", filename=p.name)


# ── AIS points (агрегат для интерактивной карты) ──────────────────────────────
#
# Возвращаем массив точек {ts, lat, lon, mmsi, name, sog, cog, sat}. Точки
# нужны для карты с фильтром по спутнику и временным скролом. Кешируем JSON
# в памяти, инвалидируя при изменении mtime каталога.

_POINTS_CACHE: dict = {"key": None, "data": None}


def _ais_dir_signature() -> tuple:
    """Грубая «подпись» каталога — суммарный mtime + кол-во файлов."""
    n = 0
    s = 0.0
    for _, _, f in _iter_ais_files():
        try:
            n += 1
            s += f.stat().st_mtime
        except OSError:
            pass
    return (n, int(s))


def _parse_iso(ts: str) -> Optional[datetime]:
    if not ts:
        return None
    try:
        # формат "2025-02-07T21:30:26.120000+00:00"
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except Exception:
        return None


def _aggregate_points() -> dict:
    points: list[dict] = []
    sat_stats: dict[str, int] = {}
    by_session: dict[str, dict] = {}
    min_ts: Optional[datetime] = None
    max_ts: Optional[datetime] = None

    for rel, sat, f in _iter_ais_files():
        sat_stats[sat] = sat_stats.get(sat, 0)
        session_key = rel.parts[0]
        if session_key not in by_session:
            by_session[session_key] = {"satellite": sat, "files": 0, "points": 0}
        by_session[session_key]["files"] += 1

        try:
            with f.open("r", encoding="utf-8-sig", errors="replace") as fh:
                reader = csv.DictReader(fh)
                for row in reader:
                    try:
                        lat = float(row.get("lat") or "")
                        lon = float(row.get("lon") or "")
                    except (TypeError, ValueError):
                        continue
                    lon = _normalize_lon(lon)
                    if not _is_plausible_arctic_point(lat, lon):
                        continue

                    ts = _parse_iso(row.get("approx_time_utc") or "")
                    if ts is None:
                        continue

                    if min_ts is None or ts < min_ts:
                        min_ts = ts
                    if max_ts is None or ts > max_ts:
                        max_ts = ts

                    mmsi = row.get("mmsi") or ""
                    name = (row.get("name") or row.get("full_name") or "").strip()
                    sog = row.get("sog") or row.get("speed") or ""
                    cog = row.get("cog") or row.get("course") or ""

                    points.append({
                        "ts":   ts.isoformat(),
                        "lat":  round(lat, 5),
                        "lon":  round(lon, 5),
                        "mmsi": str(mmsi),
                        "name": name[:32],
                        "sog":  _to_float(sog),
                        "cog":  _to_float(cog),
                        "sat":  sat,
                        "session": session_key,
                    })
                    sat_stats[sat] += 1
                    by_session[session_key]["points"] += 1
        except Exception:
            continue

    points = _filter_mmsi_outliers(points)
    points.sort(key=lambda p: p["ts"])

    return {
        "total":  len(points),
        "by_sat": sat_stats,
        "sessions": by_session,
        "min_ts": min_ts.isoformat() if min_ts else None,
        "max_ts": max_ts.isoformat() if max_ts else None,
        "points": points,
    }


def _to_float(v) -> Optional[float]:
    if v in (None, "", "None"):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


# ── Валидация AIS-точек ───────────────────────────────────────────────────────
# Сессии — арктические пролёты; координаты вне северных широт почти всегда
# означают ошибку декодирования пакета (типичный артефакт — lat ~25°, lon ~±170°).

_ARCTIC_MIN_LAT = 45.0


def _normalize_lon(lon: float) -> float:
    """Приводим долготу к диапазону [-180, 180]."""
    while lon > 180:
        lon -= 360
    while lon < -180:
        lon += 360
    return lon


def _is_plausible_arctic_point(lat: float, lon: float) -> bool:
    if not (math.isfinite(lat) and math.isfinite(lon)):
        return False
    if not (-90 <= lat <= 90):
        return False
    lon = _normalize_lon(lon)
    if lat < _ARCTIC_MIN_LAT:
        return False
    return True


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def _filter_mmsi_outliers(points: list[dict]) -> list[dict]:
    """
    Для одного MMSI иногда попадают «призрачные» позиции далеко от основной
    группы (битый декод). Оставляем крупнейший географический кластер.
    """
    by_mmsi: dict[str, list[dict]] = {}
    singles: list[dict] = []
    for p in points:
        mmsi = p.get("mmsi") or ""
        if not mmsi:
            singles.append(p)
            continue
        by_mmsi.setdefault(mmsi, []).append(p)

    kept: list[dict] = list(singles)
    max_jump_km = 400.0  # ~4° широты — разумный предел для арктического пролёта

    for mmsi, pts in by_mmsi.items():
        if len(pts) == 1:
            kept.append(pts[0])
            continue

        # Сортируем по времени, строим цепочку: добавляем точку, если она
        # не слишком далеко от предыдущей принятой.
        pts.sort(key=lambda x: x["ts"])
        chain = [pts[0]]
        for p in pts[1:]:
            prev = chain[-1]
            dist = _haversine_km(prev["lat"], prev["lon"], p["lat"], p["lon"])
            if dist <= max_jump_km:
                chain.append(p)
        if len(chain) >= max(1, len(pts) // 2):
            kept.extend(chain)
        else:
            # fallback: медианный кластер
            lats = sorted(p["lat"] for p in pts)
            lons = sorted(p["lon"] for p in pts)
            med_lat = lats[len(lats) // 2]
            med_lon = lons[len(lons) // 2]
            for p in pts:
                if _haversine_km(med_lat, med_lon, p["lat"], p["lon"]) <= max_jump_km:
                    kept.append(p)

    kept.sort(key=lambda p: p["ts"])
    return kept


@router.get("/ais/points")
def ais_points(
    sats: Optional[str] = Query(None, description="comma list: CSTP-2.1,CSTP-2.2,PU-4"),
):
    """
    Агрегированные точки AIS со всех CSV-сессий. Фильтр по спутникам опционален.
    Результат кешируется в памяти.
    """
    key = _ais_dir_signature()
    if _POINTS_CACHE["key"] != key:
        _POINTS_CACHE["data"] = _aggregate_points()
        _POINTS_CACHE["key"] = key

    data = dict(_POINTS_CACHE["data"])  # shallow copy
    if sats:
        wanted = {s.strip() for s in sats.split(",") if s.strip()}
        data["points"] = [p for p in data["points"] if p["sat"] in wanted]
        data["total"] = len(data["points"])
    return data
