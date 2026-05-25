from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, Depends, Query, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select

from sgp4.api import Satrec, jday
import math

from telemetry_config import settings
from .db import init_db, get_session
from .collector import collect_last_month
from .models import TelemetryPacket
from .collect_api import router as collect_router
from .news import router as news_router
from .auth import router as auth_router
from .user_models import User  # noqa: F401 — registers User table with SQLModel metadata
from .models import NewsItem  # noqa: F401 — registers NewsItem table with SQLModel metadata
from .sdr_bridge import attach_sdr, sdr_startup, sdr_shutdown
from .decode_api import router as decode_router
from .storage_api import router as storage_router, seed_demo_storage
from .satellites_api import router as satellites_info_router
from .gallery_api import router as gallery_router
from .ingest_api import router as ingest_router
from .teleais_api import router as teleais_router

logger = logging.getLogger(__name__)


async def _auto_collect_loop():
    interval_sec = max(60, settings.auto_collect_interval_minutes * 60)
    active_sats = [s["name"] for s in settings.satellite_fleet if s.get("active")]
    if not active_sats:
        active_sats = [settings.default_satellite]
    while True:
        for sat_name in active_sats:
            try:
                inserted = await collect_last_month(sat_name, days=settings.default_days)
                logger.info("Auto-collect finished: inserted=%s sat=%s", inserted, sat_name)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning("Auto-collect skipped for %s: %s", sat_name, exc)
        await asyncio.sleep(interval_sec)


@asynccontextmanager
async def _lifespan(app: FastAPI):
    # ── startup ──────────────────────────────────────────────────────────────
    init_db()
    if settings.auto_collect_enabled:
        app.state.auto_collect_task = asyncio.create_task(_auto_collect_loop())
        logger.info(
            "Auto-collect enabled: every %s minute(s)",
            settings.auto_collect_interval_minutes,
        )

    app.state.sdr_handles = await sdr_startup()

    yield

    # ── shutdown ──────────────────────────────────────────────────────────────
    await sdr_shutdown(app.state.sdr_handles)

    task = getattr(app.state, "auto_collect_task", None)
    if task:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


app = FastAPI(title="Telemetry Aggregator (TinyGS Telegram)", lifespan=_lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_allow_origins.split(",")]
    if settings.cors_allow_origins != "*"
    else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root(request: Request):
    """
    Корневой эндпоинт.

    Если запрос пришёл из браузера (Accept: text/html) — редиректим в SPA,
    чтобы клик «Назад в сервис» из SDR/Docs не оставлял пользователя на JSON.
    Иначе возвращаем JSON-метаданные.
    """
    accept = (request.headers.get("accept") or "").lower()
    if "text/html" in accept:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/satellites", status_code=302)
    return {
        "service": "PolySpace API",
        "status": "ok",
        "docs": "/docs",
    }


@app.get("/api/satellites/fleet")
def get_fleet() -> List[Dict[str, Any]]:
    return settings.satellite_fleet


app.include_router(collect_router)
app.include_router(news_router)
app.include_router(auth_router)
app.include_router(decode_router)
app.include_router(storage_router)
app.include_router(satellites_info_router)
app.include_router(gallery_router)
app.include_router(ingest_router)
app.include_router(teleais_router)

# Заполняем «Хранилище» демо-файлами на старте (если ещё пусто)
seed_demo_storage()

# Mount SDR sub-service under /sdr
attach_sdr(app)


# ----------------------------
# Helpers: orbit math (good enough for nice UI)
# ----------------------------
WGS84_A = 6378.137  # km
WGS84_F = 1.0 / 298.257223563
WGS84_E2 = WGS84_F * (2 - WGS84_F)


def gmst_rad(dt_utc: datetime) -> float:
    jd, fr = jday(
        dt_utc.year, dt_utc.month, dt_utc.day,
        dt_utc.hour, dt_utc.minute,
        dt_utc.second + dt_utc.microsecond / 1e6
    )
    JD = jd + fr
    T = (JD - 2451545.0) / 36525.0

    gmst_sec = (
        67310.54841 +
        (876600.0 * 3600 + 8640184.812866) * T +
        0.093104 * T * T -
        6.2e-6 * T * T * T
    )
    gmst_sec = gmst_sec % 86400.0
    return (gmst_sec / 86400.0) * (2.0 * math.pi)


def teme_to_ecef(r_teme_km: List[float], dt_utc: datetime) -> List[float]:
    gmst = gmst_rad(dt_utc)
    x, y, z = r_teme_km
    cosg = math.cos(gmst)
    sing = math.sin(gmst)

    x_ecef = cosg * x + sing * y
    y_ecef = -sing * x + cosg * y
    z_ecef = z
    return [x_ecef, y_ecef, z_ecef]


def ecef_to_geodetic(r_ecef_km: List[float]) -> (float, float):
    x, y, z = r_ecef_km
    lon = math.atan2(y, x)

    p = math.sqrt(x * x + y * y)
    lat = math.atan2(z, p * (1 - WGS84_E2))

    for _ in range(5):
        sin_lat = math.sin(lat)
        N = WGS84_A / math.sqrt(1 - WGS84_E2 * sin_lat * sin_lat)
        lat = math.atan2(z + WGS84_E2 * N * sin_lat, p)

    return math.degrees(lat), math.degrees(lon)


def normalize_lon_deg(lon: float) -> float:
    return (lon + 180.0) % 360.0 - 180.0


def _telemetry_track_fallback(
    session: Session,
    sat: str,
    base: datetime,
    limit: int = 300,
) -> Dict[str, Any] | None:
    rows = session.exec(
        select(TelemetryPacket)
        .where(
            TelemetryPacket.satellite == sat,
            TelemetryPacket.tle_lat.is_not(None),
            TelemetryPacket.tle_lon.is_not(None),
        )
        .order_by(TelemetryPacket.ts_utc.desc())
        .limit(limit)
    ).all()

    if not rows:
        return None

    rows = list(reversed(rows))
    track = [
        {
            "ts_utc": r.ts_utc.isoformat(),
            "lat": float(r.tle_lat),
            "lon": float(r.tle_lon),
        }
        for r in rows
        if r.tle_lat is not None and r.tle_lon is not None
    ]
    if not track:
        return None

    current = min(
        track,
        key=lambda p: abs(
            datetime.fromisoformat(p["ts_utc"]).replace(tzinfo=timezone.utc)
            - base
        ).total_seconds(),
    )
    return {"current": current, "track": track}


# ----------------------------
# Existing API
# ----------------------------
@app.get("/api/telemetry")
def get_telemetry(
    sat: str = Query("Polytech_Universe-3"),
    from_ts: Optional[datetime] = Query(None, alias="from"),
    to_ts: Optional[datetime] = Query(None, alias="to"),
    limit: int = Query(5000, ge=1, le=200000),
    session: Session = Depends(get_session),
):
    q = select(TelemetryPacket).where(TelemetryPacket.satellite == sat)

    if from_ts:
        if from_ts.tzinfo is None:
            from_ts = from_ts.replace(tzinfo=timezone.utc)
        q = q.where(TelemetryPacket.ts_utc >= from_ts)

    if to_ts:
        if to_ts.tzinfo is None:
            to_ts = to_ts.replace(tzinfo=timezone.utc)
        q = q.where(TelemetryPacket.ts_utc <= to_ts)

    q = q.order_by(TelemetryPacket.ts_utc).limit(limit)
    return session.exec(q).all()


@app.get("/api/satellites")
def list_satellites(session: Session = Depends(get_session)):
    rows = session.exec(select(TelemetryPacket.satellite).distinct()).all()
    return sorted(set(rows))


@app.get("/api/telemetry/series")
def get_series(
    sat: str = Query("Polytech_Universe-3"),
    from_ts: Optional[datetime] = Query(None, alias="from"),
    to_ts: Optional[datetime] = Query(None, alias="to"),
    session: Session = Depends(get_session),
):
    q = select(TelemetryPacket).where(TelemetryPacket.satellite == sat)

    if from_ts:
        if from_ts.tzinfo is None:
            from_ts = from_ts.replace(tzinfo=timezone.utc)
        q = q.where(TelemetryPacket.ts_utc >= from_ts)

    if to_ts:
        if to_ts.tzinfo is None:
            to_ts = to_ts.replace(tzinfo=timezone.utc)
        q = q.where(TelemetryPacket.ts_utc <= to_ts)

    q = q.order_by(TelemetryPacket.ts_utc)
    rows = session.exec(q).all()

    return [
        {
            "ts_utc": r.ts_utc,
            "temp_c": r.temp_c,
            "battery_capacity_pct": getattr(r, "battery_capacity_pct", None),
            "vbus_mv": r.vbus_mv,
            "solar_voltage_mv": getattr(r, "solar_voltage_mv", None),
            "ibus_ma": r.ibus_ma,
            "solar_total_mw": r.solar_total_mw,
            "rssi_dbm": r.rssi_dbm,
            "snr_db": r.snr_db,
            "uptime_sec": r.uptime_sec,
            "reset_count": r.reset_count,
        }
        for r in rows
    ]


# ----------------------------
# Orbit track endpoint (TLE + SGP4)
# ----------------------------
@app.get("/api/orbit/track")
def orbit_track(
    sat: str = Query("Polytech_Universe-3", description="Satellite name exactly as in your DB"),
    at: Optional[datetime] = Query(None, description="UTC datetime ISO, e.g. 2026-02-08T12:00:00Z"),
    minutes: int = Query(180, ge=10, le=1440, description="Track window in minutes"),
    step_sec: int = Query(20, ge=5, le=600, description="Sampling step in seconds"),
    session: Session = Depends(get_session),
) -> Dict[str, Any]:
    base = at or datetime.now(timezone.utc)
    if base.tzinfo is None:
        base = base.replace(tzinfo=timezone.utc)

    tle1, tle2 = settings.get_tle_for_satellite(sat)

    if not tle1 or not tle2:
        fallback = _telemetry_track_fallback(session, sat, base)
        if fallback:
            return {
                "sat": sat,
                "at": base.isoformat(),
                "minutes": minutes,
                "step_sec": step_sec,
                "current": fallback["current"],
                "track": fallback["track"],
                "source": "telemetry_fallback",
            }
        return {
            "sat": sat,
            "at": base.isoformat(),
            "minutes": minutes,
            "step_sec": step_sec,
            "current": None,
            "track": [],
            "source": "no_tle",
        }

    satrec = Satrec.twoline2rv(tle1, tle2)

    start = base - timedelta(minutes=minutes / 2)
    end = base + timedelta(minutes=minutes / 2)

    track = []
    current = None

    t = start
    while t <= end:
        jd, fr = jday(
            t.year, t.month, t.day,
            t.hour, t.minute,
            t.second + t.microsecond / 1e6
        )
        e, r_teme, _v = satrec.sgp4(jd, fr)
        if e == 0:
            r_ecef = teme_to_ecef(r_teme, t)
            lat, lon = ecef_to_geodetic(r_ecef)
            lon = normalize_lon_deg(lon)

            p = {"ts_utc": t.isoformat(), "lat": lat, "lon": lon}
            track.append(p)

            if current is None:
                current = p
            else:
                ct = datetime.fromisoformat(current["ts_utc"])
                if abs((t - base).total_seconds()) < abs((ct - base).total_seconds()):
                    current = p

        t += timedelta(seconds=step_sec)

    if not track:
        fallback = _telemetry_track_fallback(session, sat, base)
        if fallback:
            return {
                "sat": sat,
                "at": base.isoformat(),
                "minutes": minutes,
                "step_sec": step_sec,
                "current": fallback["current"],
                "track": fallback["track"],
                "source": "telemetry_fallback",
            }

    return {
        "sat": sat,
        "at": base.isoformat(),
        "minutes": minutes,
        "step_sec": step_sec,
        "current": current,
        "track": track,
    }