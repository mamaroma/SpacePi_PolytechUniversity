# app/collect_api.py
from __future__ import annotations

import traceback

from fastapi import APIRouter, HTTPException, Header, Query
from telemetry_config import settings
from .collector import collect_last_month

router = APIRouter(prefix="/api/collect", tags=["collect"])


def _check_token(token: str | None):
    need = (getattr(settings, "collect_token", "") or "").strip()
    if not need:
        return  # COLLECT_TOKEN not configured → open access
    provided = (token or "").strip()
    if not provided:
        raise HTTPException(
            status_code=401,
            detail="Token required — press 🔑 in the UI and enter your COLLECT_TOKEN",
        )
    if provided != need:
        raise HTTPException(status_code=401, detail="Bad token")


@router.post("/run")
async def run_collect(
    token: str | None = Query(default=None),
    x_collect_token: str | None = Header(default=None),
    sat: str | None = Query(default=None),
    days: int | None = Query(default=None, ge=1, le=3650),
):
    _check_token(token or x_collect_token)

    sat = sat or settings.default_satellite
    days = int(days or settings.default_days)

    try:
        n = await collect_last_month(sat, days=days)
    except Exception as exc:
        detail = f"{type(exc).__name__}: {exc}"
        hint = ""
        msg = str(exc).lower()
        if "auth" in msg or "session" in msg or "phone" in msg:
            hint = " (Telethon session not authenticated — run `python collect.py` locally first to log in)"
        elif "connect" in msg or "refused" in msg or "timeout" in msg:
            hint = " (cannot reach Telegram — check network / API credentials)"
        elif "database" in msg or "psycopg" in msg or "sqlalchemy" in msg:
            hint = " (database error — check DATABASE_URL in .env)"
        raise HTTPException(status_code=500, detail=detail + hint)

    return {"ok": True, "inserted": int(n), "sat": sat, "days": days}