import logging
import time
from sqlmodel import SQLModel, Session, create_engine
from sqlalchemy import text
from telemetry_config import settings

logger = logging.getLogger(__name__)

engine = create_engine(
    settings.database_url,
    echo=False,
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
    pool_pre_ping=True,
)

def init_db(retries: int = 5, delay: float = 2.0):
    """Create tables and run migrations. Retries on connection failure (useful on cold start)."""
    for attempt in range(1, retries + 1):
        try:
            SQLModel.metadata.create_all(engine)

            with engine.begin() as conn:
                url = str(engine.url)

                if url.startswith("sqlite"):
                    cols = conn.exec_driver_sql("PRAGMA table_info('telemetrypacket')").fetchall()
                    existing = {c[1] for c in cols}

                    def add_col(name: str, ddl: str):
                        if name not in existing:
                            conn.execute(text(f"ALTER TABLE telemetrypacket ADD COLUMN {ddl}"))

                    add_col("battery_capacity_pct", "battery_capacity_pct REAL")
                    add_col("solar_voltage_mv", "solar_voltage_mv INTEGER")

                else:
                    cols = conn.execute(text("""
                        SELECT column_name
                        FROM information_schema.columns
                        WHERE table_name = 'telemetrypacket'
                    """)).fetchall()
                    existing = {r[0] for r in cols}

                    def add_col(name: str, ddl: str):
                        if name not in existing:
                            conn.execute(text(f"ALTER TABLE telemetrypacket ADD COLUMN {ddl}"))

                    add_col("battery_capacity_pct", "battery_capacity_pct DOUBLE PRECISION")
                    add_col("solar_voltage_mv", "solar_voltage_mv INTEGER")

            logger.info("Database initialised successfully.")
            return

        except Exception as exc:
            logger.warning("DB init attempt %d/%d failed: %s", attempt, retries, exc)
            if attempt < retries:
                time.sleep(delay)
            else:
                logger.error("All DB init attempts failed — server will start without DB. Error: %s", exc)

def get_session():
    with Session(engine) as session:
        yield session