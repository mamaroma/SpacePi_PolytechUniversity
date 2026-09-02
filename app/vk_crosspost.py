"""Кросс-постинг новостей в сообщество ВКонтакте.

Требуемые переменные окружения:
  VK_ACCESS_TOKEN  — user access token с правами wall, photos, offline
                     (редактор/админ группы). Community token постит только текст.
  VK_GROUP_ID      — числовой id группы (без минуса), либо
  VK_GROUP_SCREEN_NAME — короткое имя, например kaoiii

Опционально:
  VK_CROSSPOST_ENABLED=true|false  (по умолчанию true, если задан токен)
  PUBLIC_SITE_URL=https://poly-space.ru
"""
from __future__ import annotations

import json
import logging
import mimetypes
import os
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

VK_API = "https://api.vk.com/method"
VK_API_VERSION = "5.199"

IMAGES_DIR = Path(__file__).resolve().parent.parent / "data" / "news" / "images"


def vk_configured() -> bool:
    return bool(os.getenv("VK_ACCESS_TOKEN", "").strip())


def vk_crosspost_enabled() -> bool:
    raw = os.getenv("VK_CROSSPOST_ENABLED", "").strip().lower()
    if raw in ("0", "false", "no", "off"):
        return False
    if raw in ("1", "true", "yes", "on"):
        return True
    return vk_configured()


def _token() -> str:
    return os.getenv("VK_ACCESS_TOKEN", "").strip()


def _site_url() -> str:
    return os.getenv("PUBLIC_SITE_URL", "https://poly-space.ru").rstrip("/")


def _api_call(method: str, params: dict[str, Any], *, token: Optional[str] = None) -> dict[str, Any]:
    payload = dict(params)
    payload["access_token"] = token or _token()
    payload["v"] = VK_API_VERSION
    data = urllib.parse.urlencode(payload).encode("utf-8")
    req = urllib.request.Request(f"{VK_API}/{method}", data=data, method="POST")
    with urllib.request.urlopen(req, timeout=60) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    if "error" in body:
        err = body["error"]
        raise RuntimeError(
            f"VK {method} error {err.get('error_code')}: {err.get('error_msg')}"
        )
    return body.get("response")


def resolve_group_id(token: Optional[str] = None) -> int:
    raw = os.getenv("VK_GROUP_ID", "").strip()
    if raw:
        return abs(int(raw))

    screen = os.getenv("VK_GROUP_SCREEN_NAME", "kaoiii").strip().lstrip("@/")
    if not screen:
        raise RuntimeError("Задайте VK_GROUP_ID или VK_GROUP_SCREEN_NAME")

    info = _api_call("utils.resolveScreenName", {"screen_name": screen}, token=token)
    if not info or info.get("type") not in ("group", "page", "event"):
        raise RuntimeError(f"VK screen name '{screen}' не является сообществом")
    return int(info["object_id"])


def build_message(title: str, description: str, content: str, news_id: str) -> str:
    parts = [title.strip()]
    desc = (description or "").strip()
    body = (content or "").strip()
    if desc and desc != title.strip():
        parts.append(desc)
    if body and body not in (desc, title.strip()):
        # VK wall message limit ~16k; keep readable preview
        preview = body if len(body) <= 2500 else body[:2490].rstrip() + "…"
        parts.append(preview)
    parts.append(f"Подробнее: {_site_url()}/news/{news_id}")
    return "\n\n".join(parts)


def _guess_ext(path_or_url: str, content_type: str = "") -> str:
    if content_type.startswith("image/"):
        ext = mimetypes.guess_extension(content_type.split(";")[0].strip()) or ".jpg"
        if ext == ".jpe":
            ext = ".jpg"
        return ext
    suffix = Path(urllib.parse.urlparse(path_or_url).path).suffix.lower()
    return suffix if suffix in {".jpg", ".jpeg", ".png", ".gif", ".webp"} else ".jpg"


def _download_or_read_image(url: str) -> tuple[bytes, str]:
    """Return (bytes, filename) for a site-relative or absolute image URL."""
    if url.startswith("/api/news/images/"):
        local = IMAGES_DIR / Path(url).name
        if local.is_file():
            return local.read_bytes(), local.name

    if url.startswith("/news-images/"):
        # Static UI assets may not be in API container; try fetching via public site
        abs_url = f"{_site_url()}{url}"
    elif url.startswith("/"):
        abs_url = f"{_site_url()}{url}"
    else:
        abs_url = url

    req = urllib.request.Request(abs_url, headers={"User-Agent": "SpacePi-VK-Crosspost/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read()
        ctype = resp.headers.get("Content-Type", "")
    name = f"photo{_guess_ext(abs_url, ctype)}"
    return data, name


def _multipart_upload(upload_url: str, file_bytes: bytes, filename: str) -> dict[str, Any]:
    boundary = "----SpacePiVKBoundary7MA4YWxkTrZu0gW"
    body = bytearray()
    body.extend(f"--{boundary}\r\n".encode())
    body.extend(
        f'Content-Disposition: form-data; name="photo"; filename="{filename}"\r\n'.encode()
    )
    ctype = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    body.extend(f"Content-Type: {ctype}\r\n\r\n".encode())
    body.extend(file_bytes)
    body.extend(f"\r\n--{boundary}--\r\n".encode())

    req = urllib.request.Request(
        upload_url,
        data=bytes(body),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


def upload_wall_photos(image_urls: list[str], group_id: int, token: Optional[str] = None) -> list[str]:
    """Upload up to 10 images; return attachment ids photo{owner}_{id}."""
    attachments: list[str] = []
    for url in image_urls[:10]:
        try:
            file_bytes, filename = _download_or_read_image(url)
        except Exception as exc:
            logger.warning("VK: skip image %s: %s", url, exc)
            continue

        server = _api_call(
            "photos.getWallUploadServer",
            {"group_id": group_id},
            token=token,
        )
        upload = _multipart_upload(server["upload_url"], file_bytes, filename)
        if not upload.get("photo") or upload.get("photo") in ("[]", ""):
            logger.warning("VK: empty upload for %s: %s", url, upload)
            continue

        saved = _api_call(
            "photos.saveWallPhoto",
            {
                "group_id": group_id,
                "photo": upload["photo"],
                "server": upload["server"],
                "hash": upload["hash"],
            },
            token=token,
        )
        if not saved:
            continue
        photo = saved[0]
        attachments.append(f"photo{photo['owner_id']}_{photo['id']}")
    return attachments


def post_news_to_vk(
    *,
    title: str,
    description: str,
    content: str,
    news_id: str,
    image_urls: Optional[list[str]] = None,
) -> dict[str, Any]:
    """Publish news to the configured VK community wall.

    Returns dict with post_id / wall_url or raises RuntimeError.
    """
    if not vk_configured():
        raise RuntimeError("VK_ACCESS_TOKEN не задан")

    token = _token()
    group_id = resolve_group_id(token)
    message = build_message(title, description, content, news_id)

    attachments: list[str] = []
    if image_urls:
        try:
            attachments = upload_wall_photos(image_urls, group_id, token=token)
        except Exception as exc:
            # Fall back to text-only post if photo API unavailable (community token)
            logger.warning("VK photo upload failed, posting text only: %s", exc)

    params: dict[str, Any] = {
        "owner_id": -group_id,
        "from_group": 1,
        "message": message,
    }
    if attachments:
        params["attachments"] = ",".join(attachments)

    result = _api_call("wall.post", params, token=token)
    post_id = result.get("post_id")
    wall_url = f"https://vk.com/wall-{group_id}_{post_id}" if post_id else None
    return {
        "ok": True,
        "group_id": group_id,
        "post_id": post_id,
        "wall_url": wall_url,
        "attachments": len(attachments),
    }


def try_crosspost_news(item_dict: dict[str, Any]) -> Optional[dict[str, Any]]:
    """Best-effort crosspost; never raises to the HTTP handler."""
    if not vk_crosspost_enabled():
        return {"ok": False, "skipped": True, "reason": "disabled_or_unconfigured"}
    try:
        return post_news_to_vk(
            title=item_dict.get("title") or "",
            description=item_dict.get("description") or "",
            content=item_dict.get("content") or "",
            news_id=item_dict.get("id") or "",
            image_urls=item_dict.get("images") or [],
        )
    except Exception as exc:
        logger.exception("VK crosspost failed")
        return {"ok": False, "error": str(exc)}
