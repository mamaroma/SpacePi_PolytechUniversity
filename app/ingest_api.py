"""
Binary packet ingestion endpoint.

Принимает сырые бинарные пакеты от наземных станций, SDR-пайплайна или любого
HTTP-клиента и сохраняет их в data/storage/telemetry/.

────────────────────────────────────────────────────────────────────────────────
Эндпоинты
────────────────────────────────────────────────────────────────────────────────

POST /api/ingest/binary
    Отправить один или несколько пакетов.

    Способ 1 — raw body (рекомендуется для микроконтроллеров/скриптов):
        Content-Type: application/octet-stream
        Body: <raw bytes>

    Способ 2 — multipart/form-data (удобно из браузера / curl):
        поле "file": бинарный файл

    Авторизация:
        X-Api-Key: <ключ>          (заголовок)
        ?api_key=<ключ>            (query-параметр — для простых устройств)

    Опциональные query-параметры:
        sat=<название спутника>    (default: Polytech_Universe-3)
        save=true/false            (сохранить на диск, default: true)
        decode=true/false          (попытаться декодировать как PU-пакет, default: true)
        fmt=pu32|raw               (формат пакета, default: pu32)

    Ответ:
        {
          "ok": true,
          "received_bytes": 64,
          "saved_as": "2026-05-20T010203_Polytech_Universe-3.bin",
          "packets": [...],        // только если decode=true
          "count": 2
        }

GET /api/ingest/packets
    Список недавно принятых файлов из data/storage/telemetry/.
    Требует того же API-ключа.
────────────────────────────────────────────────────────────────────────────────
"""
from __future__ import annotations

import os
import struct
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Any

from fastapi import APIRouter, Header, Query, Request, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ingest", tags=["ingest"])

# ── Хранилище ──────────────────────────────────────────────────────────────────
_STORAGE = Path(__file__).resolve().parent.parent / "data" / "storage" / "telemetry"
_STORAGE.mkdir(parents=True, exist_ok=True)

# ── API-ключ ───────────────────────────────────────────────────────────────────
# Берётся из переменной окружения INGEST_API_KEY.
# Если не задана — используется фиксированный дефолт (только для разработки!).
_DEFAULT_KEY = "spacepi-ingest-key-CHANGE-ME"
INGEST_API_KEY: str = os.getenv("INGEST_API_KEY", _DEFAULT_KEY)


def _check_key(
    x_api_key: Optional[str] = None,
    api_key_q: Optional[str] = None,
) -> None:
    """Проверяет наличие корректного API-ключа."""
    provided = x_api_key or api_key_q
    if not provided:
        raise HTTPException(
            401,
            detail=(
                "API key required. "
                "Pass X-Api-Key header or ?api_key= query param."
            ),
        )
    if provided != INGEST_API_KEY:
        raise HTTPException(403, detail="Invalid API key")


# ── Декодер PU-32 (тот же алгоритм, что в decode_api.py) ──────────────────────
_PU32_LEN = 32


def _crc16_ccitt(data: bytes) -> int:
    crc = 0xFFFF
    for b in data:
        crc ^= b << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) & 0xFFFF if (crc & 0x8000) else (crc << 1) & 0xFFFF
    return crc


def _decode_pu32(buf: bytes) -> dict[str, Any]:
    if len(buf) < _PU32_LEN:
        return {"error": f"too short ({len(buf)} B, need {_PU32_LEN})"}

    sync        = buf[0:2]
    sat_id      = struct.unpack("<H", buf[2:4])[0]
    ts_unix     = struct.unpack("<I", buf[4:8])[0]
    temp_raw    = struct.unpack("<i", buf[8:12])[0]
    vbus_mv     = struct.unpack("<I", buf[12:16])[0]
    ibus_ma     = struct.unpack("<i", buf[16:20])[0]
    battery_raw = struct.unpack("<H", buf[20:22])[0]
    rssi_dbm    = struct.unpack("<h", buf[22:24])[0]
    snr_db      = struct.unpack("<h", buf[24:26])[0]
    uptime_sec  = struct.unpack("<I", buf[26:30])[0]
    crc_recv    = struct.unpack(">H", buf[30:32])[0]
    crc_calc    = _crc16_ccitt(buf[:30])

    return {
        "sync_ok":     sync == b"\xAA\x55",
        "sat_id":      sat_id,
        "ts_unix":     ts_unix,
        "ts_iso":      datetime.fromtimestamp(ts_unix, tz=timezone.utc).isoformat()
                       if 1_577_836_800 < ts_unix < 4_102_444_800 else None,
        "temp_c":      temp_raw / 100.0,
        "vbus_mv":     vbus_mv,
        "ibus_ma":     ibus_ma,
        "battery_pct": battery_raw / 10.0,
        "rssi_dbm":    rssi_dbm,
        "snr_db":      snr_db,
        "uptime_sec":  uptime_sec,
        "crc_recv":    f"0x{crc_recv:04X}",
        "crc_calc":    f"0x{crc_calc:04X}",
        "crc_ok":      crc_recv == crc_calc,
    }


def _decode_raw(data: bytes, fmt: str) -> list[dict]:
    """Разобрать бинарный буфер на пакеты и вернуть список декодированных полей."""
    if fmt != "pu32":
        # raw — просто возвращаем hex без парсинга
        return [{"hex": data.hex(" "), "size_bytes": len(data)}]

    packets = []
    offset = 0
    n = 0
    while offset + _PU32_LEN <= len(data):
        chunk = data[offset: offset + _PU32_LEN]
        decoded = _decode_pu32(chunk)
        decoded["offset"] = offset
        decoded["hex"]    = chunk.hex(" ")
        packets.append(decoded)
        offset += _PU32_LEN
        n += 1
        if n >= 1000:
            break
    return packets


# ── POST /api/ingest/binary ────────────────────────────────────────────────────

@router.post("/binary")
async def ingest_binary(
    request: Request,
    file: Optional[UploadFile] = File(default=None),
    # auth
    x_api_key: Optional[str] = Header(default=None, alias="X-Api-Key"),
    api_key:   Optional[str] = Query(default=None),
    # options
    sat:    str  = Query(default="Polytech_Universe-3"),
    save:   bool = Query(default=True),
    decode: bool = Query(default=True),
    fmt:    str  = Query(default="pu32", pattern="^(pu32|raw)$"),
):
    """
    Принять бинарные пакеты.

    **Способ 1 — raw body** (`Content-Type: application/octet-stream`):
    ```
    curl -X POST https://spacepi.ru/api/ingest/binary \\
         -H "X-Api-Key: <ключ>" \\
         -H "Content-Type: application/octet-stream" \\
         --data-binary @packet.bin
    ```

    **Способ 2 — multipart** (из браузера или `curl -F`):
    ```
    curl -X POST https://spacepi.ru/api/ingest/binary \\
         -H "X-Api-Key: <ключ>" \\
         -F "file=@packet.bin"
    ```

    **Способ 3 — query-param ключ** (для простых MCU без поддержки custom headers):
    ```
    curl -X POST "https://spacepi.ru/api/ingest/binary?api_key=<ключ>" \\
         -H "Content-Type: application/octet-stream" \\
         --data-binary @packet.bin
    ```
    """
    _check_key(x_api_key, api_key)

    # ── читаем данные ──────────────────────────────────────────────────────────
    content_type = request.headers.get("content-type", "")

    if file is not None:
        # multipart/form-data
        raw = await file.read()
        source_name = file.filename or "upload.bin"
    elif "application/octet-stream" in content_type or "application/x-binary" in content_type:
        raw = await request.body()
        source_name = "raw_body.bin"
    else:
        # Пробуем прочитать body в любом случае
        raw = await request.body()
        if not raw:
            raise HTTPException(
                400,
                "Empty body. Send raw bytes with Content-Type: application/octet-stream "
                "or use multipart/form-data with a 'file' field.",
            )
        source_name = "body.bin"

    if not raw:
        raise HTTPException(400, "Empty payload")

    if len(raw) > 10 * 1024 * 1024:  # 10 MB hard cap
        raise HTTPException(413, "Payload too large (max 10 MB)")

    logger.info(
        "ingest/binary: sat=%s fmt=%s size=%d source=%s",
        sat, fmt, len(raw), source_name,
    )

    # ── сохраняем на диск ──────────────────────────────────────────────────────
    saved_as: Optional[str] = None
    if save:
        ts_tag = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%S")
        safe_sat = sat.replace(" ", "_").replace("/", "_")
        filename = f"{ts_tag}_{safe_sat}.bin"
        dst = _STORAGE / filename
        # Если файл с таким именем уже есть — добавляем суффикс
        if dst.exists():
            filename = f"{ts_tag}_{safe_sat}_{len(raw)}B.bin"
            dst = _STORAGE / filename
        dst.write_bytes(raw)
        saved_as = filename
        logger.info("ingest/binary: saved → %s", dst)

    # ── декодируем ─────────────────────────────────────────────────────────────
    packets: list[dict] = []
    if decode:
        packets = _decode_raw(raw, fmt)

    response: dict[str, Any] = {
        "ok":             True,
        "received_bytes": len(raw),
        "sat":            sat,
        "fmt":            fmt,
        "saved_as":       saved_as,
    }
    if decode:
        response["count"]   = len(packets)
        response["packets"] = packets

    return JSONResponse(content=response, status_code=200)


# ── GET /api/ingest/packets ────────────────────────────────────────────────────

@router.get("/packets")
def list_received(
    x_api_key: Optional[str] = Header(default=None, alias="X-Api-Key"),
    api_key:   Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
):
    """Список последних принятых бинарных файлов в data/storage/telemetry/."""
    _check_key(x_api_key, api_key)

    files = sorted(
        (p for p in _STORAGE.iterdir() if p.is_file()),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )[:limit]

    return [
        {
            "name":      f.name,
            "size_bytes": f.stat().st_size,
            "mtime_iso": datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc).isoformat(),
        }
        for f in files
    ]


# ── GET /api/ingest/key-info ───────────────────────────────────────────────────

@router.get("/key-info")
def key_info(
    x_api_key: Optional[str] = Header(default=None, alias="X-Api-Key"),
    api_key:   Optional[str] = Query(default=None),
):
    """Проверить корректность ключа без отправки данных."""
    _check_key(x_api_key, api_key)
    is_default = (INGEST_API_KEY == _DEFAULT_KEY)
    return {
        "ok":         True,
        "key_source": "env" if not is_default else "default (insecure!)",
        "warning":    "Set INGEST_API_KEY in .env" if is_default else None,
    }
