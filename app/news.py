from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
from .auth import require_editor
from .storage import upload_image, is_s3_configured

router = APIRouter(prefix="/api/news", tags=["news"])

NEWS_DIR = Path(__file__).resolve().parent.parent / "data" / "news"
NEWS_FILE = NEWS_DIR / "news.json"
IMAGES_DIR = NEWS_DIR / "images"

_DEFAULT_NEWS = [
    {
        "id": "welcome",
        "title": "Добро пожаловать в PolySpace!",
        "description": "Платформа наземной станции Политехнического университета для мониторинга спутников, кораблей и электромагнитного излучения.",
        "content": "PolySpace Ground Station — это комплексная платформа, разработанная в СПбПУ для мониторинга космических аппаратов серии Polytech Universe, отслеживания морских судов по протоколу AIS, анализа электромагнитной обстановки и интерактивного обучения школьников основам радиоприёма.\n\nПлатформа включает:\n• Телеметрию спутников в реальном времени\n• Мониторинг кораблей (AIS)\n• Карту электромагнитного излучения\n• Интерактивный SDR-сервис для школьников\n\nИспользуйте меню навигации для доступа к различным сервисам.",
        "image_url": None,
        "created_at": "2026-01-15T10:00:00+00:00",
    },
    {
        "id": "pu5-launch",
        "title": "Polytech Universe-5 успешно выведен на орбиту",
        "description": "Новый спутник серии Polytech Universe начал передачу телеметрии. Все системы функционируют штатно.",
        "content": "Спутник Polytech Universe-5 был успешно выведен на низкую околоземную орбиту. Первый сигнал был получен наземной станцией СПбПУ через 45 минут после отделения от разгонного блока.\n\nХарактеристики:\n• Орбита: LEO ~500 км\n• Частота: 437.5 МГц (UHF)\n• Протокол: LoRa\n• Масса: 3U CubeSat\n\nТелеметрия показывает нормальное функционирование всех подсистем. Температура бортовой аппаратуры в допустимых пределах, солнечные панели развёрнуты, энергобаланс положительный.",
        "image_url": None,
        "created_at": "2025-09-20T14:30:00+00:00",
    },
]


def _ensure_dirs():
    NEWS_DIR.mkdir(parents=True, exist_ok=True)
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    if not NEWS_FILE.exists():
        NEWS_FILE.write_text(json.dumps(_DEFAULT_NEWS, ensure_ascii=False, indent=2))


def _load_news() -> list:
    _ensure_dirs()
    try:
        items = json.loads(NEWS_FILE.read_text())
        for item in items:
            item.setdefault("views", 0)
        return items
    except (json.JSONDecodeError, FileNotFoundError):
        return list(_DEFAULT_NEWS)


def _save_news(data: list):
    _ensure_dirs()
    NEWS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2))


@router.get("")
def list_news():
    news = _load_news()
    return sorted(news, key=lambda x: x.get("created_at", ""), reverse=True)


@router.get("/images/{filename}")
def get_image(filename: str):
    path = IMAGES_DIR / filename
    if not path.exists():
        raise HTTPException(404, "Image not found")
    return FileResponse(path)


@router.post("/{news_id}/view")
def increment_view(news_id: str):
    news = _load_news()
    for item in news:
        if item["id"] == news_id:
            item["views"] = item.get("views", 0) + 1
            _save_news(news)
            return {"views": item["views"]}
    raise HTTPException(404, "News not found")


@router.get("/{news_id}")
def get_news(news_id: str):
    for item in _load_news():
        if item["id"] == news_id:
            return item
    raise HTTPException(404, "News not found")


@router.post("")
async def create_news(
    title: str = Form(...),
    description: str = Form(...),
    content: str = Form(""),
    image: Optional[UploadFile] = File(None),
    _=Depends(require_editor),
):
    _ensure_dirs()
    news_id = uuid.uuid4().hex[:8]
    image_url = None

    if image and image.filename:
        ext = os.path.splitext(image.filename)[1] or ".jpg"
        image_filename = f"{news_id}{ext}"
        image_data = await image.read()

        if is_s3_configured():
            s3_key = f"news/images/{image_filename}"
            image_url = upload_image(image_data, s3_key, image.filename)

        if not image_url:
            _ensure_dirs()
            (IMAGES_DIR / image_filename).write_bytes(image_data)
            image_url = f"/api/news/images/{image_filename}"

    item = {
        "id": news_id,
        "title": title,
        "description": description,
        "content": content or description,
        "image_url": image_url,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    news = _load_news()
    news.append(item)
    _save_news(news)
    return item


@router.delete("/{news_id}")
def delete_news(news_id: str, _=Depends(require_editor)):
    news = _load_news()
    updated = [n for n in news if n["id"] != news_id]
    if len(updated) == len(news):
        raise HTTPException(404, "News not found")
    _save_news(updated)
    return {"ok": True}
