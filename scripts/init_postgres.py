from sqlmodel import SQLModel, create_engine

from telemetry_config import settings  # берет DATABASE_URL из .env
from app.models import TelemetryPacket  # важно импортнуть модели, чтобы таблицы попали в metadata


def main():
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is empty. Check your .env")

    print("Using DATABASE_URL:", settings.database_url)

    engine = create_engine(settings.database_url, echo=True)

    # создаст все таблицы из SQLModel моделей (если их нет)
    SQLModel.metadata.create_all(engine)

    print("✅ Tables created (or already exist).")


if __name__ == "__main__":
    main()