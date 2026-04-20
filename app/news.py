from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
from sqlmodel import Session, select

from .auth import require_editor
from .db import get_session, engine
from .models import NewsItem
from .storage import upload_image, is_s3_configured

router = APIRouter(prefix="/api/news", tags=["news"])

IMAGES_DIR = Path(__file__).resolve().parent.parent / "data" / "news" / "images"

_DEFAULT_NEWS = [
    NewsItem(
        id="welcome",
        title="Добро пожаловать в PolySpace!",
        description="Платформа наземной станции Политехнического университета для мониторинга спутников, кораблей и электромагнитного излучения.",
        content="PolySpace Ground Station — это комплексная платформа, разработанная в СПбПУ для мониторинга космических аппаратов серии Polytech Universe, отслеживания морских судов по протоколу AIS, анализа электромагнитной обстановки и интерактивного обучения школьников основам радиоприёма.\n\nПлатформа включает:\n• Телеметрию спутников в реальном времени\n• Мониторинг кораблей (AIS)\n• Карту электромагнитного излучения\n• Интерактивный SDR-сервис для школьников\n\nИспользуйте меню навигации для доступа к различным сервисам.",
        created_at=datetime(2026, 1, 15, 10, 0, 0, tzinfo=timezone.utc),
    ),
    NewsItem(
        id="pu5-launch",
        title="Polytech Universe-5 успешно выведен на орбиту",
        description="Новый спутник серии Polytech Universe начал передачу телеметрии. Все системы функционируют штатно.",
        content="Спутник Polytech Universe-5 был успешно выведен на низкую околоземную орбиту. Первый сигнал был получен наземной станцией СПбПУ через 45 минут после отделения от разгонного блока.\n\nХарактеристики:\n• Орбита: LEO ~500 км\n• Частота: 437.5 МГц (UHF)\n• Протокол: LoRa\n• Масса: 3U CubeSat\n\nТелеметрия показывает нормальное функционирование всех подсистем.",
        created_at=datetime(2025, 9, 20, 14, 30, 0, tzinfo=timezone.utc),
    ),
]


def _seed_default_news(session: Session):
    """Insert default news items if the table is empty."""
    count = session.exec(select(NewsItem)).first()
    if count is None:
        for item in _DEFAULT_NEWS:
            session.add(item)
        session.commit()


def _item_to_dict(item: NewsItem) -> dict:
    return {
        "id": item.id,
        "title": item.title,
        "description": item.description,
        "content": item.content,
        "image_url": item.image_url,
        "created_at": item.created_at.isoformat() if item.created_at else None,
        "views": item.views,
    }


@router.get("")
def list_news(session: Session = Depends(get_session)):
    _seed_default_news(session)
    items = session.exec(select(NewsItem).order_by(NewsItem.created_at.desc())).all()
    return [_item_to_dict(i) for i in items]


@router.get("/images/{filename}")
def get_image(filename: str):
    """Serve images that were uploaded before S3 migration (local fallback)."""
    path = IMAGES_DIR / filename
    if not path.exists():
        raise HTTPException(404, "Image not found")
    return FileResponse(path)


@router.post("/{news_id}/view")
def increment_view(news_id: str, session: Session = Depends(get_session)):
    item = session.get(NewsItem, news_id)
    if not item:
        raise HTTPException(404, "News not found")
    item.views = (item.views or 0) + 1
    session.add(item)
    session.commit()
    return {"views": item.views}


@router.get("/{news_id}")
def get_news(news_id: str, session: Session = Depends(get_session)):
    item = session.get(NewsItem, news_id)
    if not item:
        raise HTTPException(404, "News not found")
    return _item_to_dict(item)


@router.post("")
async def create_news(
    title: str = Form(...),
    description: str = Form(...),
    content: str = Form(""),
    image: Optional[UploadFile] = File(None),
    _=Depends(require_editor),
    session: Session = Depends(get_session),
):
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
            IMAGES_DIR.mkdir(parents=True, exist_ok=True)
            (IMAGES_DIR / image_filename).write_bytes(image_data)
            image_url = f"/api/news/images/{image_filename}"

    item = NewsItem(
        id=news_id,
        title=title,
        description=description,
        content=content or description,
        image_url=image_url,
        created_at=datetime.now(timezone.utc),
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    return _item_to_dict(item)


@router.delete("/{news_id}")
def delete_news(news_id: str, _=Depends(require_editor), session: Session = Depends(get_session)):
    item = session.get(NewsItem, news_id)
    if not item:
        raise HTTPException(404, "News not found")
    session.delete(item)
    session.commit()
    return {"ok": True}
