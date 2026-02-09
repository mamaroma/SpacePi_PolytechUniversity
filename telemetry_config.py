# telemetry_config.py
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Tuple

from dotenv import load_dotenv

# ----------------------------
# Load .env from project root
# ----------------------------
PROJECT_ROOT = Path(__file__).resolve().parent
load_dotenv(dotenv_path=PROJECT_ROOT / ".env", override=False)

# ----------------------------
# Helpers
# ----------------------------
def _getenv(name: str, default=None, cast=None):
    v = os.getenv(name, default)
    if cast and v is not None:
        try:
            return cast(v)
        except Exception:
            return default
    return v

def _norm_sat_env_key(sat: str) -> str:
    """
    Polytech_Universe-3 -> POLYTECH_UNIVERSE_3
    """
    key = sat.strip().upper()
    for ch in [" ", "-", ".", "/"]:
        key = key.replace(ch, "_")
    while "__" in key:
        key = key.replace("__", "_")
    return key

# ----------------------------
# OLD SETTINGS (keep)
# ----------------------------
API_ID = _getenv("TG_API_ID", 21664726, int)
API_HASH = _getenv("TG_API_HASH", "de070de393ff80313763716357177c1c")

URLS_FILE = _getenv("URLS_FILE", str(PROJECT_ROOT / "data" / "urls.csv"))
PROCESSED_DIR = _getenv("PROCESSED_DIR", str(PROJECT_ROOT / "processed_data"))
STATE_DIR = _getenv("STATE_DIR", str(PROJECT_ROOT / "data" / "state"))

REQUEST_DELAY = (
    float(_getenv("REQUEST_DELAY_MIN", 1)),
    float(_getenv("REQUEST_DELAY_MAX", 3)),
)

HEADERS = {
    "User-Agent": _getenv(
        "HTTP_USER_AGENT",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    ),
    "Accept-Language": _getenv("HTTP_ACCEPT_LANGUAGE", "en-US,en;q=0.9"),
    "Connection": _getenv("HTTP_CONNECTION", "keep-alive"),
}

# ----------------------------
# NEW SETTINGS
# ----------------------------
TG_CHANNEL = _getenv("TG_CHANNEL", "t.me/tinyGS_Telemetry")
DATABASE_URL = _getenv("DATABASE_URL", f"sqlite:///{PROJECT_ROOT / 'telemetry.db'}")
CORS_ALLOW_ORIGINS = _getenv("CORS_ALLOW_ORIGINS", "http://localhost:5173")

DEFAULT_SATELLITE = _getenv("DEFAULT_SATELLITE", "Polytech_Universe-3")
DEFAULT_DAYS = _getenv("DEFAULT_DAYS", 30, int)

TELETHON_SESSION_NAME = _getenv("TELETHON_SESSION_NAME", str(PROJECT_ROOT / "user_session"))

# ✅ ВАЖНО: объявляем ДО settings = Settings(...)
COLLECT_TOKEN = _getenv("COLLECT_TOKEN", "")

# ----------------------------
# Settings object
# ----------------------------
@dataclass(frozen=True)
class Settings:
    tg_api_id: int
    tg_api_hash: str
    tg_channel: str
    telethon_session_name: str

    database_url: str
    cors_allow_origins: str

    default_satellite: str
    default_days: int

    collect_token: str

    def get_tle_for_satellite(self, sat: str) -> Tuple[str, str]:
        """
        Read TLE from env:
          TLE_<SAT>_1
          TLE_<SAT>_2

        SAT is normalized: Polytech_Universe-3 -> POLYTECH_UNIVERSE_3
        """
        k = _norm_sat_env_key(sat)
        tle1 = os.getenv(f"TLE_{k}_1", "").strip()
        tle2 = os.getenv(f"TLE_{k}_2", "").strip()
        return tle1, tle2


settings = Settings(
    tg_api_id=int(API_ID),
    tg_api_hash=str(API_HASH),
    tg_channel=str(TG_CHANNEL),
    telethon_session_name=str(TELETHON_SESSION_NAME),

    database_url=str(DATABASE_URL),
    cors_allow_origins=str(CORS_ALLOW_ORIGINS),

    default_satellite=str(DEFAULT_SATELLITE),
    default_days=int(DEFAULT_DAYS),

    collect_token=str(COLLECT_TOKEN),
)