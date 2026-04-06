import asyncio
import sys
from pathlib import Path

from telethon.sessions import StringSession

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.collector import make_telegram_client


async def main() -> None:
    client = make_telegram_client()
    await client.connect()
    if not await client.is_user_authorized():
        await client.disconnect()
        raise SystemExit("Telethon session is not authorized. Run `python collect.py` first.")

    print(StringSession.save(client.session))
    await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
