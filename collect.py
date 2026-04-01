"""
CLI entry point: authenticate Telethon interactively (if needed) and
collect the last N days of telemetry from Telegram → DB.

Run this once from a terminal to log in:
    python collect.py

Subsequent runs (and the FastAPI /api/collect/run endpoint) reuse the
saved session file without requiring interactive input.
"""
import asyncio
from pathlib import Path

from telethon import TelegramClient

from app.collector import collect_last_month, _SESSION_PATH
from app.db import init_db
from telemetry_config import settings


async def _ensure_auth() -> None:
    """Connects and prompts for phone/code if the session isn't authorized yet."""
    client = TelegramClient(str(_SESSION_PATH), settings.tg_api_id, settings.tg_api_hash)
    await client.start()   # interactive: asks phone + code if needed
    await client.disconnect()
    print("✓ Telethon session authenticated and saved.")


if __name__ == "__main__":
    init_db()

    session_file = Path(str(_SESSION_PATH) + ".session")
    if not session_file.exists():
        print("Session file not found — starting interactive login…")
        asyncio.run(_ensure_auth())
    else:
        # Quick check: re-auth if session is stale
        async def _check():
            client = TelegramClient(str(_SESSION_PATH), settings.tg_api_id, settings.tg_api_hash)
            await client.connect()
            ok = await client.is_user_authorized()
            await client.disconnect()
            return ok

        if not asyncio.run(_check()):
            print("Session expired — starting interactive login…")
            asyncio.run(_ensure_auth())

    n = asyncio.run(
        collect_last_month(settings.default_satellite, days=settings.default_days)
    )
    print(f"✓ Inserted {n} new packets for {settings.default_satellite}.")
