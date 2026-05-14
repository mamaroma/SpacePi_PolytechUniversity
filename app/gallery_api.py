"""
CNN Gallery — хранение фотографий в Yandex Cloud Object Storage (S3-compatible).

Все фото лежат в бакете под префиксом  gallery/cnn/
Загрузка доступна только admin/moderator.
Просмотр (список + прямые URL) — публичный.

Переменные окружения (.env):
  YC_S3_ACCESS_KEY   — access key ID
  YC_S3_SECRET_KEY   — secret access key
  YC_S3_BUCKET       — имя бакета (например: space-pi-bucket)
  YC_S3_ENDPOINT     — необязательно, default https://storage.yandexcloud.net
"""
from __future__ import annotations

import io
import os
import mimetypes
import uuid
from datetime import datetime, timezone
from typing import Optional

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from botocore.config import Config
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Path as FPath
from fastapi.responses import JSONResponse

from .auth import require_editor, get_current_user_optional

router = APIRouter(prefix="/api/gallery", tags=["gallery"])

GALLERY_PREFIX = "gallery/cnn/"
YC_ENDPOINT = os.getenv("YC_S3_ENDPOINT", "https://storage.yandexcloud.net")
YC_BUCKET = os.getenv("YC_S3_BUCKET", "")
YC_ACCESS_KEY = os.getenv("YC_S3_ACCESS_KEY", "")
YC_SECRET_KEY = os.getenv("YC_S3_SECRET_KEY", "")

ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_SIZE = 20 * 1024 * 1024  # 20 MB


def _s3():
    if not YC_BUCKET or not YC_ACCESS_KEY or not YC_SECRET_KEY:
        raise HTTPException(503, "S3 storage not configured — set YC_S3_* env vars")
    return boto3.client(
        "s3",
        endpoint_url=YC_ENDPOINT,
        aws_access_key_id=YC_ACCESS_KEY,
        aws_secret_access_key=YC_SECRET_KEY,
        config=Config(signature_version="s3v4"),
        region_name="ru-central1",
    )


def _public_url(key: str) -> str:
    bucket = YC_BUCKET
    endpoint = YC_ENDPOINT.rstrip("/")
    return f"{endpoint}/{bucket}/{key}"


@router.get("")
async def list_gallery(_user=Depends(get_current_user_optional)):
    """Возвращает список фотографий галереи (публичный)."""
    try:
        s3 = _s3()
        paginator = s3.get_paginator("list_objects_v2")
        photos = []
        for page in paginator.paginate(Bucket=YC_BUCKET, Prefix=GALLERY_PREFIX):
            for obj in page.get("Contents", []):
                key = obj["Key"]
                if key == GALLERY_PREFIX:
                    continue
                photos.append({
                    "key": key,
                    "filename": key.removeprefix(GALLERY_PREFIX),
                    "url": _public_url(key),
                    "size_bytes": obj["Size"],
                    "mtime_iso": obj["LastModified"].isoformat(),
                })
        photos.sort(key=lambda p: p["mtime_iso"], reverse=True)
        return photos
    except (BotoCoreError, ClientError) as exc:
        raise HTTPException(502, f"S3 error: {exc}") from exc


@router.post("")
async def upload_photo(
    file: UploadFile = File(...),
    _editor=Depends(require_editor),
):
    """Загружает фото в галерею (только admin/moderator)."""
    data = await file.read()

    if len(data) > MAX_SIZE:
        raise HTTPException(413, f"File too large (max {MAX_SIZE // 1024 // 1024} MB)")

    mime = file.content_type or mimetypes.guess_type(file.filename or "")[0] or ""
    if mime not in ALLOWED_MIME:
        raise HTTPException(415, f"Unsupported media type: {mime}. Allowed: {ALLOWED_MIME}")

    ext = mimetypes.guess_extension(mime) or ".jpg"
    if ext == ".jpe":
        ext = ".jpg"

    safe_name = f"{uuid.uuid4().hex}{ext}"
    key = f"{GALLERY_PREFIX}{safe_name}"

    try:
        s3 = _s3()
        s3.put_object(
            Bucket=YC_BUCKET,
            Key=key,
            Body=data,
            ContentType=mime,
            ACL="public-read",
        )
    except (BotoCoreError, ClientError) as exc:
        raise HTTPException(502, f"S3 upload error: {exc}") from exc

    return {
        "ok": True,
        "key": key,
        "filename": safe_name,
        "url": _public_url(key),
        "size_bytes": len(data),
    }


@router.delete("/{filename}")
async def delete_photo(
    filename: str = FPath(..., description="filename returned by list/upload"),
    _editor=Depends(require_editor),
):
    """Удаляет фото из галереи (только admin/moderator)."""
    if "/" in filename or filename.startswith("."):
        raise HTTPException(400, "Bad filename")

    key = f"{GALLERY_PREFIX}{filename}"
    try:
        s3 = _s3()
        s3.delete_object(Bucket=YC_BUCKET, Key=key)
    except (BotoCoreError, ClientError) as exc:
        raise HTTPException(502, f"S3 delete error: {exc}") from exc

    return {"ok": True, "key": key}


@router.get("/status")
async def gallery_status():
    """Проверяет доступность S3 и выдаёт конфигурацию (без секретов)."""
    configured = bool(YC_BUCKET and YC_ACCESS_KEY and YC_SECRET_KEY)
    if not configured:
        return {"configured": False, "bucket": None, "endpoint": YC_ENDPOINT}
    try:
        s3 = _s3()
        s3.head_bucket(Bucket=YC_BUCKET)
        reachable = True
    except Exception as exc:
        reachable = False
    return {
        "configured": configured,
        "reachable": reachable,
        "bucket": YC_BUCKET,
        "endpoint": YC_ENDPOINT,
        "prefix": GALLERY_PREFIX,
    }
