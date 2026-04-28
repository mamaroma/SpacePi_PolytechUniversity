"""
«Хранилище» — сырые AIS / Telemetry / IQ пакеты для скачивания.

Файлы лежат на диске в  data/storage/ais  и  data/storage/telemetry
(а также data/storage/iq для будущих сырых записей).

Доступ:
  • moderator + admin — могут смотреть, скачивать, загружать, удалять.
  • reader            — должен предъявить fixed STORAGE_SECRET_KEY.
"""
from __future__ import annotations

import os
import shutil
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import FileResponse

from .auth import get_current_user, get_current_user_optional, require_editor
from .user_models import User, UserRole

router = APIRouter(prefix="/api/storage", tags=["storage"])

# Один и тот же ключ всегда (требование пользователя). Нельзя менять.
STORAGE_SECRET_KEY = (
    "f7c3e0b1a89d4257b6e21a5c0d8f4ea3"
    "9b74c1e0a6d258f3b5c019fa72ed3c48"
)

ROOT = Path(__file__).resolve().parent.parent / "data" / "storage"
KINDS = ("ais", "telemetry", "iq")

for k in KINDS:
    (ROOT / k).mkdir(parents=True, exist_ok=True)


def _check_access(user: Optional[User], unlock_key: Optional[str]) -> None:
    """admin/moderator pass; reader passes only with the right key."""
    if user is None:
        # пробуем войти как reader через ключ
        if unlock_key == STORAGE_SECRET_KEY:
            return
        raise HTTPException(401, "Authentication required")

    if user.role in (UserRole.ADMIN, UserRole.MODERATOR):
        return

    if user.role == UserRole.READER and unlock_key == STORAGE_SECRET_KEY:
        return

    raise HTTPException(403, "Storage is locked. Provide secret key or login as moderator.")


def _safe_name(name: str) -> str:
    name = os.path.basename(name)
    if not name or name.startswith("."):
        raise HTTPException(400, "Bad filename")
    return name


def _list_kind(kind: str) -> list[dict]:
    if kind not in KINDS:
        raise HTTPException(400, f"Unknown kind: {kind}")
    folder = ROOT / kind
    folder.mkdir(parents=True, exist_ok=True)
    out = []
    for p in sorted(folder.iterdir()):
        if not p.is_file():
            continue
        st = p.stat()
        out.append({
            "name":       p.name,
            "kind":       kind,
            "size_bytes": st.st_size,
            "mtime_iso":  datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat(),
        })
    return out


@router.get("")
def list_storage(
    user=Depends(get_current_user_optional),
    unlock_key: Optional[str] = Query(None),
):
    _check_access(user, unlock_key)
    return {kind: _list_kind(kind) for kind in KINDS}


@router.get("/{kind}/{name}")
def download(
    kind: str,
    name: str,
    user=Depends(get_current_user_optional),
    unlock_key: Optional[str] = Query(None),
):
    _check_access(user, unlock_key)
    if kind not in KINDS:
        raise HTTPException(400, f"Unknown kind: {kind}")
    name = _safe_name(name)
    p = ROOT / kind / name
    if not p.is_file():
        raise HTTPException(404, "file not found")
    return FileResponse(str(p), media_type="application/octet-stream", filename=name)


@router.post("/{kind}")
async def upload(
    kind: str,
    file: UploadFile = File(...),
    _: User = Depends(require_editor),
):
    if kind not in KINDS:
        raise HTTPException(400, f"Unknown kind: {kind}")
    name = _safe_name(file.filename or "untitled.bin")
    dst = ROOT / kind / name
    with dst.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"ok": True, "name": name, "kind": kind, "size": dst.stat().st_size}


@router.delete("/{kind}/{name}")
def delete(
    kind: str,
    name: str,
    _: User = Depends(require_editor),
):
    if kind not in KINDS:
        raise HTTPException(400, f"Unknown kind: {kind}")
    name = _safe_name(name)
    p = ROOT / kind / name
    if not p.is_file():
        raise HTTPException(404, "file not found")
    p.unlink()
    return {"ok": True}


@router.get("/_secret_key")
def get_secret_key(user: User = Depends(get_current_user)):
    """Только админ может посмотреть ключ — используется на странице «Управление»."""
    if user.role != UserRole.ADMIN:
        raise HTTPException(403, "Admin only")
    return {"secret_key": STORAGE_SECRET_KEY}


# ─── seed: положим демо-файлы при первом запуске ────────────────────────────
def seed_demo_storage() -> None:
    ais_demo = ROOT / "ais" / "demo_ais_raw.txt"
    if not ais_demo.exists():
        ais_demo.write_text(
            "!AIVDM,1,1,,A,13lq2>002f0V3scdr8ATr40p8L07,0*6A\n"
            "!AIVDM,1,1,,B,15?dU2h0j710dfifFDumRTHr0<0=,0*33\n"
            "!AIVDM,1,1,,A,16:V?<002C0u9DcdrG@TrA0v0L08,0*1F\n"
            "!AIVDM,1,1,,B,1:Wj?<002b0u9scdr0BUrA0o8L0;,0*44\n"
            "!AIVDM,1,1,,A,1:5JS3000P0v?cccr8AUcA0p8L0=,0*5C\n",
            encoding="utf-8",
        )

    tlm_demo = ROOT / "telemetry" / "demo_telemetry.bin"
    if not tlm_demo.exists():
        import struct as _struct, time as _time

        def _crc16(d: bytes) -> int:
            crc = 0xFFFF
            for b in d:
                crc ^= b << 8
                for _ in range(8):
                    crc = ((crc << 1) ^ 0x1021) & 0xFFFF if (crc & 0x8000) else (crc << 1) & 0xFFFF
            return crc

        out = bytearray()
        base = int(_time.time())
        for i in range(8):
            body = (
                b"\xAA\x55"
                + _struct.pack("<H", 3)                              # sat_id
                + _struct.pack("<I", base + i * 30)                  # ts
                + _struct.pack("<i", int((-5 + i * 1.7) * 100))      # temp
                + _struct.pack("<I", 3700 + i * 12)                  # vbus
                + _struct.pack("<i", -50 + i * 7)                    # ibus
                + _struct.pack("<H", int((78 - i * 0.8) * 10))       # battery%
                + _struct.pack("<h", -110 + (i % 5))                 # rssi
                + _struct.pack("<h", 6 + (i % 4))                    # snr
                + _struct.pack("<I", 24 * 3600 + i * 30)             # uptime
            )
            out += body + _struct.pack(">H", _crc16(bytes(body)))
        tlm_demo.write_bytes(bytes(out))

    iq_demo = ROOT / "iq" / "README.txt"
    if not iq_demo.exists():
        iq_demo.write_text(
            "Сюда складываются raw IQ записи от SDR\n"
            "(complex float32, обычно 250 kS/s, 437.845 МГц)\n",
            encoding="utf-8",
        )
