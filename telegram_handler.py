import asyncio
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from telethon import TelegramClient

from telemetry_config import API_ID, API_HASH, STATE_DIR
from state_manager import MsgFlag, StateStore, dict_to_flag, flag_to_dict, make_state_path


# Match first URL-like substring in message text
_URL_RE = re.compile(r"https?://\S+")


def _normalize_channel_username(channel_name: str) -> Optional[str]:
    """
    Convert 't.me/xxx' / 'https://t.me/xxx' / '@xxx' into 'xxx'
    so we can build https://t.me/<username>/<message_id> permalinks.
    """
    s = (channel_name or "").strip()
    if s.startswith("https://t.me/"):
        s = s.replace("https://t.me/", "", 1)
    if s.startswith("http://t.me/"):
        s = s.replace("http://t.me/", "", 1)
    if s.startswith("t.me/"):
        s = s.replace("t.me/", "", 1)
    s = s.strip("/@ ")
    return s or None


def _extract_url(msg: Any, channel_name: str) -> Optional[str]:
    """
    Extract URL from a message:
    1) Try inline buttons (msg.buttons)
    2) Try parsing URL from message text
    3) Fallback: build t.me link to the message (public channels)
    """
    # 1) Buttons
    try:
        if getattr(msg, "buttons", None):
            return msg.buttons[0][0].url
    except Exception:
        pass

    # 2) Text URL
    text = (getattr(msg, "message", None) or "").strip()
    m = _URL_RE.search(text)
    if m:
        return m.group(0)

    # 3) Message permalink (public channel)
    username = _normalize_channel_username(channel_name)
    if username:
        return f"https://t.me/{username}/{int(msg.id)}"
    return None


@dataclass
class CollectedRecord:
    url: str
    date: str  # ISO string
    message_id: int

    def to_dict(self) -> Dict[str, Any]:
        return {
            "url": self.url,
            "date": self.date,
            "message_id": self.message_id,
        }


async def get_channel_info(channel_name: str) -> Optional[Dict[str, Any]]:
    """Resolve channel entity and return basic info."""
    async with TelegramClient("session_name", API_ID, API_HASH) as client:
        try:
            entity = await client.get_entity(channel_name)
            return {"name": getattr(entity, "title", str(channel_name)), "id": entity.id, "entity": entity}
        except Exception as e:
            print(f"Error fetching channel info: {e}")
            return None


async def _get_latest_message_flag(client: TelegramClient, channel_entity: Any) -> Optional[MsgFlag]:
    async for msg in client.iter_messages(channel_entity, limit=1):
        return MsgFlag.from_message(msg)
    return None


async def collect_links_with_flags(
    channel_name: str,
    search_term: str,
    max_records: int = 10,
    batch_size: int = 99,
    reconnect_delay_sec: float = 2.0,
    session_name: str = "session_name",
) -> List[CollectedRecord]:
    """Collect TinyGS telemetry links from a Telegram channel with persistent flags.

    Implements the 'start/middle/end flags' logic:
    - start_flag: newest message at the beginning of a manual run
    - middle_flag: cursor updated every batch_size messages (for safe reconnect/resume)
    - end_flag: last *collected* message (cursor for next manual run)

    State is persisted in a JSON text file (STATE_DIR/flags_*.json).
    """

    state_path = make_state_path(STATE_DIR, channel_name, search_term)
    store = StateStore(state_path)
    state = store.load()

    collected: List[CollectedRecord] = []

    async with TelegramClient(session_name, API_ID, API_HASH) as client:
        try:
            channel_entity = await client.get_entity(channel_name)
        except Exception as e:
            raise RuntimeError(f"Cannot access channel: {channel_name}: {e}")

        latest_flag = await _get_latest_message_flag(client, channel_entity)

        # Determine starting cursor
        prev_end = dict_to_flag(state.get("end_flag"))
        prev_middle = dict_to_flag(state.get("middle_flag"))

        if state.get("status") == "in_progress" and prev_middle is not None:
            # Crash recovery: resume exactly from middle_flag to avoid gaps
            cursor = prev_middle
            run_reason = "resume_unfinished"
        elif prev_end is not None:
            # Normal manual rerun: continue archive from previous end_flag (older messages)
            cursor = prev_end
            run_reason = "continue_archive"
        else:
            # First run: start from newest
            cursor = None
            run_reason = "first_run"

        # Mark run start
        state["status"] = "in_progress"
        state["meta"] = {
            "channel": channel_name,
            "search_term": search_term,
            "batch_size": int(batch_size),
            "max_records": int(max_records),
            "run_reason": run_reason,
            "started_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
        if latest_flag is not None:
            state["start_flag"] = flag_to_dict(latest_flag)
        if cursor is not None:
            state["middle_flag"] = flag_to_dict(cursor)
        store.save(state)

        # Helper for fetching a batch
        async def fetch_batch(start_cursor: Optional[MsgFlag]) -> List[Any]:
            kwargs: Dict[str, Any] = {"limit": batch_size}
            if start_cursor is not None:
                # iter_messages returns messages with id < offset_id (older)
                kwargs["offset_id"] = int(start_cursor.id)
            msgs: List[Any] = []
            async for msg in client.iter_messages(channel_entity, **kwargs):
                msgs.append(msg)
            return msgs

        # Main loop: scan batches of up to batch_size messages
        while len(collected) < max_records:
            try:
                messages = await fetch_batch(cursor)
            except Exception as e:
                # Network/session hiccup: wait and retry from the last persisted middle_flag
                print(f"Telegram read error: {e}. Reconnecting from middle_flag...")
                await asyncio.sleep(reconnect_delay_sec)
                state = store.load()
                cursor = dict_to_flag(state.get("middle_flag")) or cursor
                continue

            if not messages:
                print("[batch] got=0 (no more messages), stopping.")
                break

            print(
                f"[batch] got={len(messages)}  "
                f"ids: {messages[0].id}->{messages[-1].id}  "
                f"collected={len(collected)}/{max_records}"
            )

            # Process messages (newest -> oldest within the batch)
            last_in_batch: Optional[MsgFlag] = None
            for msg in messages:
                last_in_batch = MsgFlag.from_message(msg)

                text = msg.message or ""

                # Debug helper (optional): shows what the channel actually contains
                if "Polytech" in text:
                    print("FOUND Polytech in msg", msg.id)
                    print(text[:300])
                    print("----")

                if search_term in text:
                    # Always return something useful:
                    # - button URL if exists
                    # - URL from text if exists
                    # - otherwise a permalink to this channel message
                    url = _extract_url(msg, channel_name)
                    if not url:
                        continue

                    rec = CollectedRecord(
                        url=url,
                        date=msg.date.isoformat(timespec="seconds"),
                        message_id=int(msg.id),
                    )
                    collected.append(rec)

                    # end_flag is always the last collected message (oldest collected so far)
                    state["end_flag"] = flag_to_dict(MsgFlag.from_message(msg))

                    if len(collected) >= max_records:
                        break

            # Update middle_flag for safe resume
            if last_in_batch is not None:
                cursor = last_in_batch
                state["middle_flag"] = flag_to_dict(cursor)
                store.save(state)

            # Proactive disconnect/reconnect:
            # Do it only if we likely hit the "batch_size limit" boundary.
            # If Telegram returned < batch_size messages, we are near the end of history (or limited),
            # and reconnecting just spams logs.
            if len(messages) >= batch_size and len(collected) < max_records:
                await client.disconnect()
                await asyncio.sleep(reconnect_delay_sec)
                await client.connect()

        # Finalize
        state["status"] = "idle"
        state["meta"]["finished_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        state["meta"]["collected"] = int(len(collected))
        store.save(state)

    return collected


# Backwards-compatible helper (kept for old main.py)
async def collect_urls(channel_name: str, search_term: str, limit: int = 100) -> List[str]:
    """Legacy collector: returns only URLs from the latest N messages."""
    urls: List[str] = []
    async with TelegramClient("session_name", API_ID, API_HASH) as client:
        async for message in client.iter_messages(channel_name, limit=limit):
            if message.message and search_term in message.message:
                url = _extract_url(message, channel_name)
                if url:
                    urls.append(url)
    return urls