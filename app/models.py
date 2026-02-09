from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlmodel import SQLModel, Field


class TelemetryPacket(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)

    channel: str = Field(index=True)
    message_id: int = Field(index=True)
    satellite: str = Field(index=True)

    # время сообщения (UTC) из Telegram
    ts_utc: datetime = Field(index=True)

    # сырой текст сообщения (чтобы можно было перепарсить позже)
    raw_text: str

    # основные “поля” под графики (nullable)
    tle_lat: Optional[float] = None
    tle_lon: Optional[float] = None

    temp_c: Optional[float] = None
    temp_min_c: Optional[float] = None
    temp_max_c: Optional[float] = None

    vbus_mv: Optional[int] = None
    ibus_ma: Optional[int] = None

    solar_total_mw: Optional[int] = None

    rssi_dbm: Optional[int] = None
    snr_db: Optional[int] = None

    uptime_sec: Optional[int] = None
    reset_count: Optional[int] = None