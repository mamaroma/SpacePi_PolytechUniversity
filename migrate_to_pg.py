#!/usr/bin/env python3
"""
Migrate telemetry data from local SQLite → Render PostgreSQL.

Usage:
    python migrate_to_pg.py "postgresql://user:pass@host/dbname"

The script is idempotent: it skips rows that already exist
(matched by channel + message_id).
"""
import sys
import sqlite3
from pathlib import Path
from datetime import datetime, timezone

PROJECT_ROOT = Path(__file__).resolve().parent

def main():
    if len(sys.argv) < 2:
        print("Usage: python migrate_to_pg.py 'postgresql://...'")
        sys.exit(1)

    pg_url = sys.argv[1]
    sqlite_path = PROJECT_ROOT / "telemetry.db"

    if not sqlite_path.exists():
        print(f"SQLite DB not found: {sqlite_path}")
        sys.exit(1)

    print(f"Source: {sqlite_path}")
    print(f"Target: {pg_url[:50]}...")

    # ── read SQLite ────────────────────────────────────────────────
    src = sqlite3.connect(str(sqlite_path))
    src.row_factory = sqlite3.Row
    rows = src.execute("SELECT * FROM telemetrypacket ORDER BY id").fetchall()
    src.close()
    print(f"Rows to migrate: {len(rows)}")

    # ── connect to postgres ────────────────────────────────────────
    import psycopg2
    import psycopg2.extras

    conn = psycopg2.connect(pg_url)
    conn.autocommit = False
    cur = conn.cursor()

    # Create table if it doesn't exist yet (matches SQLModel schema)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS telemetrypacket (
            id                  SERIAL PRIMARY KEY,
            channel             TEXT NOT NULL,
            message_id          INTEGER NOT NULL,
            satellite           TEXT NOT NULL,
            ts_utc              TIMESTAMPTZ NOT NULL,
            raw_text            TEXT NOT NULL,
            tle_lat             DOUBLE PRECISION,
            tle_lon             DOUBLE PRECISION,
            temp_c              DOUBLE PRECISION,
            temp_min_c          DOUBLE PRECISION,
            temp_max_c          DOUBLE PRECISION,
            vbus_mv             INTEGER,
            ibus_ma             INTEGER,
            battery_capacity_pct DOUBLE PRECISION,
            solar_voltage_mv    INTEGER,
            solar_total_mw      INTEGER,
            rssi_dbm            INTEGER,
            snr_db              INTEGER,
            uptime_sec          INTEGER,
            reset_count         INTEGER
        )
    """)

    # Unique index to support idempotent upsert
    cur.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_channel_msgid
        ON telemetrypacket (channel, message_id)
    """)
    conn.commit()

    # ── migrate rows ───────────────────────────────────────────────
    inserted = skipped = 0
    for r in rows:
        cur.execute("""
            INSERT INTO telemetrypacket
                (channel, message_id, satellite, ts_utc, raw_text,
                 tle_lat, tle_lon,
                 temp_c, temp_min_c, temp_max_c,
                 vbus_mv, ibus_ma,
                 battery_capacity_pct, solar_voltage_mv,
                 solar_total_mw, rssi_dbm, snr_db, uptime_sec, reset_count)
            VALUES
                (%(channel)s, %(message_id)s, %(satellite)s, %(ts_utc)s, %(raw_text)s,
                 %(tle_lat)s, %(tle_lon)s,
                 %(temp_c)s, %(temp_min_c)s, %(temp_max_c)s,
                 %(vbus_mv)s, %(ibus_ma)s,
                 %(battery_capacity_pct)s, %(solar_voltage_mv)s,
                 %(solar_total_mw)s, %(rssi_dbm)s, %(snr_db)s, %(uptime_sec)s, %(reset_count)s)
            ON CONFLICT (channel, message_id) DO NOTHING
        """, {
            "channel":              r["channel"],
            "message_id":           r["message_id"],
            "satellite":            r["satellite"],
            "ts_utc":               r["ts_utc"],
            "raw_text":             r["raw_text"],
            "tle_lat":              r["tle_lat"],
            "tle_lon":              r["tle_lon"],
            "temp_c":               r["temp_c"],
            "temp_min_c":           r["temp_min_c"],
            "temp_max_c":           r["temp_max_c"],
            "vbus_mv":              r["vbus_mv"],
            "ibus_ma":              r["ibus_ma"],
            "battery_capacity_pct": r["battery_capacity_pct"] if "battery_capacity_pct" in r.keys() else None,
            "solar_voltage_mv":     r["solar_voltage_mv"] if "solar_voltage_mv" in r.keys() else None,
            "solar_total_mw":       r["solar_total_mw"],
            "rssi_dbm":             r["rssi_dbm"],
            "snr_db":               r["snr_db"],
            "uptime_sec":           r["uptime_sec"],
            "reset_count":          r["reset_count"],
        })

        if cur.rowcount:
            inserted += 1
        else:
            skipped += 1

        if (inserted + skipped) % 100 == 0:
            print(f"  {inserted + skipped}/{len(rows)} processed…")

    conn.commit()
    cur.close()
    conn.close()

    print(f"\nDone. Inserted: {inserted}, Skipped (already existed): {skipped}")

if __name__ == "__main__":
    main()
