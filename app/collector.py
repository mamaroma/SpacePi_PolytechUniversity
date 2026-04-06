from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlmodel import Session, select
from telethon import TelegramClient
from telethon.sessions import StringSession

from telemetry_config import settings
from .db import engine
from .models import TelemetryPacket
from .parser import parse_tinygs_telegram

# Always resolve to project root so the path works regardless of CWD.
# Prefer TELETHON_SESSION_NAME from env, but keep compatibility with the
# previously hardcoded telemetry_session file if it already exists.
_PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _resolve_session_path() -> Path:
    configured = (settings.telethon_session_name or "").strip()
    if configured:
        base = Path(configured)
        if not base.is_absolute():
            base = (_PROJECT_ROOT / base).resolve()
    else:
        base = (_PROJECT_ROOT / "telemetry_session").resolve()

    legacy = (_PROJECT_ROOT / "telemetry_session").resolve()
    base_session = Path(str(base) + ".session")
    legacy_session = Path(str(legacy) + ".session")

    if base_session.exists() or not legacy_session.exists():
        return base
    return legacy


_SESSION_PATH = _resolve_session_path()


def get_session_file_path() -> Path:
    return Path(str(_SESSION_PATH) + ".session")


def has_telethon_session() -> bool:
    return bool((settings.telethon_session_string or "").strip()) or get_session_file_path().exists()


def make_telegram_client() -> TelegramClient:
    session_string = (settings.telethon_session_string or "").strip()
    if session_string:
        return TelegramClient(StringSession(session_string), settings.tg_api_id, settings.tg_api_hash)
    return TelegramClient(str(_SESSION_PATH), settings.tg_api_id, settings.tg_api_hash)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def collect_last_month(satellite: str = "Polytech_Universe-3", days: int = 30) -> int:
    if not settings.tg_api_id or not settings.tg_api_hash:
        raise RuntimeError("Set TG_API_ID and TG_API_HASH in .env")

    session_file = get_session_file_path()
    if not has_telethon_session():
        raise RuntimeError(
            "Telethon session not configured. "
            f"Expected file at {session_file} or TELETHON_SESSION_STRING in env. "
            "Run `python collect.py` locally first to authenticate."
        )

    since = utcnow() - timedelta(days=days)

    try:
        client = make_telegram_client()
        await client.connect()
    except EOFError:
        raise RuntimeError(
            "Telethon session requires interactive login. "
            "Run `python collect.py` in a terminal first to authenticate."
        )

    if not await client.is_user_authorized():
        await client.disconnect()
        raise RuntimeError(
            "Telethon session is not authorized. "
            "Run `python collect.py` in a terminal first to log in."
        )

    async with client:
        entity = await client.get_entity(settings.tg_channel)

        inserted = 0
        with Session(engine) as session:
            async for msg in client.iter_messages(entity):
                if not msg.date:
                    continue
                msg_ts = msg.date.replace(tzinfo=timezone.utc)
                if msg_ts < since:
                    break

                text = msg.message or ""
                if satellite not in text:
                    continue

                # дедуп по message_id
                exists = session.exec(
                    select(TelemetryPacket).where(
                        TelemetryPacket.channel == settings.tg_channel,
                        TelemetryPacket.message_id == msg.id,
                    )
                ).first()
                if exists:
                    continue

                parsed = parse_tinygs_telegram(text)
                if not parsed:
                    continue

                row = TelemetryPacket(
                    channel=settings.tg_channel,
                    message_id=msg.id,
                    satellite=parsed.satellite,
                    ts_utc=msg_ts,
                    raw_text=text,
                    tle_lat=parsed.tle_lat,
                    tle_lon=parsed.tle_lon,
                    temp_c=parsed.temp_c,
                    temp_min_c=parsed.temp_min_c,
                    temp_max_c=parsed.temp_max_c,
                    vbus_mv=parsed.vbus_mv,
                    ibus_ma=parsed.ibus_ma,
                    battery_capacity_pct=parsed.battery_capacity_pct,
                    solar_voltage_mv=parsed.solar_voltage_mv,
                    solar_total_mw=parsed.solar_total_mw,
                    rssi_dbm=parsed.rssi_dbm,
                    snr_db=parsed.snr_db,
                    uptime_sec=parsed.uptime_sec,
                    reset_count=parsed.reset_count,
                )
                session.add(row)
                inserted += 1

            session.commit()

        return inserted