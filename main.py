import asyncio
import json
import re
import logging
from datetime import datetime

from telegram_handler import collect_links_with_flags, get_channel_info
from utils import log_info


def _configure_quiet_logging() -> None:
    """
    Silence noisy libs (Telethon in particular) so main.py doesn't spam logs.
    Keep our own log_info() messages visible.
    """
    # Most of Telethon spam comes from these loggers
    logging.getLogger("telethon").setLevel(logging.WARNING)
    logging.getLogger("telethon.network").setLevel(logging.WARNING)
    logging.getLogger("telethon.client").setLevel(logging.WARNING)

    # Also quiet asyncio debug noise if any
    logging.getLogger("asyncio").setLevel(logging.WARNING)

    # If some handler elsewhere set root level too low, ensure root isn't verbose
    root = logging.getLogger()
    if root.level < logging.INFO:
        root.setLevel(logging.INFO)


def sanitize_filename(name: str) -> str:
    return re.sub(r"[\\/*?:\"<>|]", "_", name)


if __name__ == "__main__":
    _configure_quiet_logging()

    # Logging the start of the application
    log_info("Starting the application...")

    # Define constants
    CHANNEL_NAME = "t.me/tinyGS_Telemetry"
    SEARCH_TERM = "Polytech_Universe-5"
    MAX_RECORDS = 10  # how many new telemetry records to collect per manual run

    # Step 1: Get channel info
    log_info(f"Fetching channel info for: {CHANNEL_NAME}")
    channel_info = asyncio.run(get_channel_info(CHANNEL_NAME))
    if not channel_info:
        log_info("Channel not found or access denied. Exiting.")
        raise SystemExit(1)

    # Print only minimal info (no big entity object)
    print(f"Channel info: name={channel_info.get('name')} id={channel_info.get('id')}")

    # Step 2: Collect links using flags (start/middle/end) and automatic reconnect
    log_info(f"Collecting telemetry links from: {CHANNEL_NAME} for: {SEARCH_TERM} (max={MAX_RECORDS})")
    records = asyncio.run(
        collect_links_with_flags(
            channel_name=CHANNEL_NAME,
            search_term=SEARCH_TERM,
            max_records=MAX_RECORDS,
            batch_size=99,
            reconnect_delay_sec=2.0,
            session_name="session_name",
        )
    )

    log_info(f"Collected {len(records)} records.")

    # Step 3: Save daily txt/json snapshot (compatible with existing parse.py)
    today = datetime.now().strftime("%Y-%m-%d")

    name_term = sanitize_filename(SEARCH_TERM)
    txt_file = f"{name_term}_{today}.txt"
    json_file = f"{name_term}_{today}.json"

    # Sort newest->oldest by message_id
    records_sorted = sorted(records, key=lambda r: r.message_id, reverse=True)

    with open(txt_file, "w", encoding="utf-8") as f:
        for r in records_sorted:
            dt = datetime.fromisoformat(r.date)
            human_date = dt.strftime("%Y-%m-%d %H:%M")
            f.write(f"{r.url} {human_date} {r.message_id}\n")
    log_info(f"Saved: {txt_file}")

    json_out = []
    for r in records_sorted:
        dt = datetime.fromisoformat(r.date)
        json_out.append(
            {
                "url": r.url,
                "date": dt.strftime("%Y-%m-%d %H:%M"),
                "message_id": r.message_id,
            }
        )
    with open(json_file, "w", encoding="utf-8") as f:
        json.dump(json_out, f, ensure_ascii=False, indent=4)
    log_info(f"Saved: {json_file}")

    # Logging the completion of the application
    log_info("Application finished successfully.")