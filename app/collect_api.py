# app/collect_api.py
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Header, Query
from telemetry_config import settings
from .collector import collect_last_month

router = APIRouter(prefix="/api/collect", tags=["collect"])


def _check_token(token: str | None):
    need = getattr(settings, "collect_token", "") or ""
    if need and token != need:
        raise HTTPException(status_code=401, detail="Bad token")


@router.post("/run")
async def run_collect(
    # можно передавать ?token=... или заголовком X-Collect-Token
    token: str | None = Query(default=None),
    x_collect_token: str | None = Header(default=None),

    sat: str | None = Query(default=None),
    days: int | None = Query(default=None, ge=1, le=3650),
):
    _check_token(token or x_collect_token)

    sat = sat or settings.default_satellite
    days = int(days or settings.default_days)

    n = await collect_last_month(sat, days=days)
    return {"ok": True, "inserted": int(n), "sat": sat, "days": days}