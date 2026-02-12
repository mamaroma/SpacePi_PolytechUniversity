from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlmodel import Session, select
from telethon import TelegramClient

from telemetry_config import settings
from .db import engine
from .models import TelemetryPacket
from .parser import parse_tinygs_telegram


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def collect_last_month(satellite: str = "Polytech_Universe-3", days: int = 30) -> int:
    if not settings.tg_api_id or not settings.tg_api_hash:
        raise RuntimeError("Set TG_API_ID and TG_API_HASH in .env")

    since = utcnow() - timedelta(days=days)

    async with TelegramClient("telemetry_session", settings.tg_api_id, settings.tg_api_hash) as client:
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