"""
Yandex Cloud Object Storage (S3-compatible) helper.

If YC_S3_ACCESS_KEY / YC_S3_SECRET_KEY are not set, falls back to
local filesystem so the app still works in dev without cloud credentials.
"""
from __future__ import annotations

import logging
import mimetypes
import os
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

_YC_ENDPOINT = "https://storage.yandexcloud.net"
_YC_REGION = "ru-central1"

_BUCKET: Optional[str] = None
_s3_client = None


def _get_client():
    """Lazily build the boto3 S3 client on first use."""
    global _s3_client, _BUCKET

    if _s3_client is not None:
        return _s3_client

    access_key = os.getenv("YC_S3_ACCESS_KEY", "")
    secret_key = os.getenv("YC_S3_SECRET_KEY", "")
    _BUCKET = os.getenv("YC_S3_BUCKET", "space-pi-bucket")

    if not access_key or not secret_key:
        return None

    try:
        import boto3
        _s3_client = boto3.client(
            "s3",
            endpoint_url=_YC_ENDPOINT,
            region_name=_YC_REGION,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
        )
        logger.info("Yandex Cloud S3 client initialised (bucket=%s)", _BUCKET)
    except Exception as exc:
        logger.warning("Failed to init S3 client: %s", exc)
        _s3_client = None

    return _s3_client


def upload_image(data: bytes, key: str, filename: str) -> Optional[str]:
    """
    Upload *data* to S3 under *key* and return the public URL.

    Returns None if S3 is not configured (caller must fall back to local FS).
    Content-type is guessed from *filename*.
    """
    client = _get_client()
    if client is None:
        return None

    bucket = _BUCKET or "space-pi-bucket"
    content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"

    try:
        client.put_object(
            Bucket=bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )
        public_url = f"{_YC_ENDPOINT}/{bucket}/{key}"
        logger.info("Uploaded %s → %s", key, public_url)
        return public_url
    except Exception as exc:
        logger.error("S3 upload failed for key=%s: %s", key, exc)
        return None


def delete_object(key: str) -> bool:
    """Delete an object from S3. Returns True on success."""
    client = _get_client()
    if client is None:
        return False

    bucket = _BUCKET or "space-pi-bucket"
    try:
        client.delete_object(Bucket=bucket, Key=key)
        logger.info("Deleted S3 object %s", key)
        return True
    except Exception as exc:
        logger.error("S3 delete failed for key=%s: %s", key, exc)
        return False


def is_s3_configured() -> bool:
    """Return True if Yandex Cloud credentials are present."""
    return bool(os.getenv("YC_S3_ACCESS_KEY") and os.getenv("YC_S3_SECRET_KEY"))
