"""
CLI entry point: authenticate Telethon interactively (if needed) and
collect the last N days of telemetry from Telegram → DB.

Run this once from a terminal to log in:
    python collect.py

Subsequent runs (and the FastAPI /api/collect/run endpoint) reuse the
saved session file without requiring interactive input.
"""
import asyncio

from telethon.sessions import StringSession

from app.collector import (
    collect_last_month,
    get_session_file_path,
    has_telethon_session,
    make_telegram_client,
)
from app.db import init_db
from telemetry_config import settings


async def _ensure_auth() -> None:
    """Connects and prompts for phone/code if the session isn't authorized yet."""
    client = make_telegram_client()
    await client.start()   # interactive: asks phone + code if needed
    session_string = (settings.telethon_session_string or "").strip()
    if session_string:
        print("✓ TELETHON_SESSION_STRING session refreshed in memory.")
        print("Update TELETHON_SESSION_STRING on Render if you want the hosted collector to use the new login.")
        print(StringSession.save(client.session))
    await client.disconnect()
    print("✓ Telethon session authenticated and saved.")


if __name__ == "__main__":
    init_db()

    session_file = get_session_file_path()
    print(f"Using Telethon session file: {session_file}")
    if not has_telethon_session():
        print("Session file not found — starting interactive login…")
        asyncio.run(_ensure_auth())
    else:
        # Quick check: re-auth if session is stale
        async def _check():
            client = make_telegram_client()
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
