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
KINDS = ("ais", "telemetry", "iq", "demo_emi")

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


@router.get("/_demo_emi")
def public_demo_emi():
    """Публичный эндпоинт: демонстрационные пакеты ЭМИ для страницы /emi.
    Возвращает то, что лежит в data/storage/demo_emi/demo_emi_packets.json
    (без обязательной авторизации — это open-data demo)."""
    import json as _json
    f = ROOT / "demo_emi" / "demo_emi_packets.json"
    if not f.exists():
        return []
    try:
        return _json.loads(f.read_text(encoding="utf-8"))
    except Exception:
        return []


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

    # ─── Демонстрационные пакеты ЭМИ-карты ───────────────────────────────
    emi_demo = ROOT / "demo_emi" / "demo_emi_packets.json"
    if not emi_demo.exists():
        import json as _json, random as _random
        _random.seed(42)

        # Реалистичные «горячие точки» по миру (мегаполисы + промышленность)
        SEEDS = [
            ("St. Petersburg",     59.93,  30.30),
            ("Moscow",             55.75,  37.61),
            ("Berlin",             52.52,  13.40),
            ("Paris",              48.85,   2.35),
            ("London",             51.50,  -0.12),
            ("Stockholm",          59.32,  18.07),
            ("Helsinki",           60.16,  24.93),
            ("Tokyo",              35.68, 139.76),
            ("Seoul",              37.56, 126.97),
            ("Beijing",            39.90, 116.40),
            ("Shanghai",           31.23, 121.47),
            ("Hong Kong",          22.30, 114.17),
            ("Singapore",           1.30, 103.85),
            ("Mumbai",             18.97,  72.83),
            ("Dubai",              25.27,  55.30),
            ("New York",           40.71, -74.00),
            ("Los Angeles",        34.05,-118.24),
            ("San Francisco",      37.77,-122.42),
            ("Mexico City",        19.43, -99.13),
            ("Sao Paulo",         -23.55, -46.63),
            ("Rio de Janeiro",    -22.91, -43.17),
            ("Buenos Aires",      -34.61, -58.38),
            ("Cape Town",         -33.92,  18.42),
            ("Lagos",               6.52,   3.38),
            ("Cairo",              30.04,  31.24),
            ("Sydney",            -33.87, 151.21),
            ("Melbourne",         -37.81, 144.96),
            ("Murmansk",           68.97,  33.08),
            ("Krasnoyarsk",        56.01,  92.85),
            ("Vladivostok",        43.13, 131.91),
        ]
        FREQS = [145.8, 433.0, 437.5, 868.0, 915.0, 2400.0, 5800.0]
        # Только спутниковые / эфирные источники, без мелких наземных
        # излучателей (WiFi/микроволновки/сотовые) — карта про космический
        # сегмент, а не про бытовую RF-засветку.
        SOURCES = [
            "Satellite downlink noise",
            "CubeSat beacon (UHF)",
            "Atmospheric ducting",
            "Ionospheric scintillation",
            "VHF broadcast interference",
            "UHF uplink noise",
            "LoRa satellite uplink",
            "Solar radio burst",
            "Industrial RF",
        ]

        out = []
        idx = 0
        # Вокруг каждого центра разбрасываем по 35–60 точек, чтобы получилось
        # ~1300 точек по миру. Этого хватит, чтобы карта была насыщенной.
        for name, clat, clon in SEEDS:
            for _ in range(_random.randint(35, 65)):
                lat = clat + (_random.random() - 0.5) * 5.0
                lon = clon + (_random.random() - 0.5) * 5.0
                freq = _random.choice(FREQS)
                # Сила связана с близостью к центру
                d2 = (lat - clat) ** 2 + (lon - clon) ** 2
                base = -30 - d2 * 2.5
                power = base + (_random.random() - 0.5) * 12
                power = max(-110, min(-22, power))
                ts = (
                    f"2026-{_random.randint(1, 4):02d}-{_random.randint(1, 28):02d}"
                    f"T{_random.randint(0, 23):02d}:{_random.randint(0, 59):02d}:00Z"
                )
                idx += 1
                out.append({
                    "id":         idx,
                    "lat":        round(lat, 4),
                    "lon":        round(lon, 4),
                    "freq_mhz":   freq,
                    "power_dbm":  round(power, 1),
                    "source":     _random.choice(SOURCES),
                    "ts":         ts,
                    "region":     name,
                })

        emi_demo.write_text(_json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
