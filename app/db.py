from sqlmodel import SQLModel, Session, create_engine
from sqlalchemy import text
from telemetry_config import settings

engine = create_engine(
    settings.database_url,
    echo=False,
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
)

def init_db():
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
            # Postgres / others: check columns via information_schema
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

def get_session():
    with Session(engine) as session:
        yield session