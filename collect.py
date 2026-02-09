import asyncio

from app.collector import collect_last_month
from app.db import init_db
from telemetry_config import settings

if __name__ == "__main__":
    init_db()  # <-- создаст таблицы, если их нет
    n = asyncio.run(collect_last_month(settings.default_satellite, days=settings.default_days))
    print("inserted:", n)