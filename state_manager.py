import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Optional


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@dataclass
class MsgFlag:
    """Stable cursor for Telegram archive parsing.

    NOTE: we store BOTH message id and date.
    Dates alone are not unique (several messages may share the same minute/second).
    """

    id: int
    date: str  # ISO string (UTC or with tz offset)

    @classmethod
    def from_message(cls, message: Any) -> "MsgFlag":
        # telethon Message.date is timezone-aware datetime
        dt = message.date
        return cls(id=int(message.id), date=dt.isoformat(timespec="seconds"))


class StateStore:
    """JSON state file used as a 'text flags file' (start/middle/end flags)."""

    def __init__(self, path: str):
        self.path = path

    def load(self) -> Dict[str, Any]:
        if not os.path.exists(self.path):
            return {
                "version": 1,
                "status": "idle",  # idle | in_progress
                "created_at": _now_iso(),
                "updated_at": _now_iso(),
                "start_flag": None,
                "middle_flag": None,
                "end_flag": None,
                "last_run": None,
            }
        with open(self.path, "r", encoding="utf-8") as f:
            return json.load(f)

    def save(self, state: Dict[str, Any]) -> None:
        os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)
        state["updated_at"] = _now_iso()
        tmp_path = self.path + ".tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(state, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, self.path)


def make_state_path(state_dir: str, channel_name: str, search_term: str) -> str:
    safe = f"{channel_name}_{search_term}".replace("/", "_").replace(":", "_")
    safe = "".join(c if c.isalnum() or c in "-_ ." else "_" for c in safe)
    return os.path.join(state_dir, f"flags_{safe}.json")


def flag_to_dict(flag: Optional[MsgFlag]) -> Optional[Dict[str, Any]]:
    if flag is None:
        return None
    return {"id": int(flag.id), "date": flag.date}


def dict_to_flag(d: Optional[Dict[str, Any]]) -> Optional[MsgFlag]:
    if not d:
        return None
    return MsgFlag(id=int(d["id"]), date=str(d["date"]))
