# app/collect_api.py
from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, HTTPException, Query
from telemetry_config import settings
from .collector import collect_last_month

_executor = ThreadPoolExecutor(max_workers=1)

router = APIRouter(prefix="/api/collect", tags=["collect"])


@router.post("/run")
async def run_collect(
    sat: str | None = Query(default=None),
    days: int | None = Query(default=None, ge=1, le=3650),
):

    sat = sat or settings.default_satellite
    days = int(days or settings.default_days)

    try:
        loop = asyncio.get_event_loop()
        n = await loop.run_in_executor(
            _executor,
            lambda: asyncio.run(collect_last_month(sat, days=days)),
        )
    except Exception as exc:
        detail = f"{type(exc).__name__}: {exc}"
        hint = ""
        msg = str(exc).lower()
        if "auth" in msg or "session" in msg or "phone" in msg:
            hint = (
                " (Telethon session missing/expired — for hosted auto-collect set "
                "TELETHON_SESSION_STRING or mount TELETHON_SESSION_NAME on persistent storage)"
            )
        elif "connect" in msg or "refused" in msg or "timeout" in msg:
            hint = " (cannot reach Telegram — check network / API credentials)"
        elif "database" in msg or "psycopg" in msg or "sqlalchemy" in msg:
            hint = " (database error — check DATABASE_URL in .env)"
        raise HTTPException(status_code=500, detail=detail + hint)

    return {"ok": True, "inserted": int(n), "sat": sat, "days": days}