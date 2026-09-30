"""Configuration settings for SDR streaming application."""
import os
from pathlib import Path

# FFT Configuration (defaults, can be overridden via API)
DEFAULT_FFT_SIZE = int(os.getenv("DEFAULT_FFT_SIZE", "1024"))
DEFAULT_FFT_UPDATE_RATE = int(os.getenv("DEFAULT_FFT_UPDATE_RATE", "15"))  # FPS

# ZeroMQ Configuration
ZMQ_ADDRESS = os.getenv("ZMQ_ADDRESS", "tcp://localhost:5555")
ZMQ_TIMEOUT = int(os.getenv("ZMQ_TIMEOUT", "1000"))  # milliseconds

# Signal defaults
DEFAULT_SAMPLE_RATE = int(os.getenv("DEFAULT_SAMPLE_RATE", "625000"))  # 625 kHz
DEFAULT_CENTER_FREQUENCY = int(os.getenv("DEFAULT_CENTER_FREQUENCY", "436610000"))  # 436.55 MHz + 60 kHz
CENTER_FREQUENCY_OFFSET_HZ = int(os.getenv("CENTER_FREQUENCY_OFFSET_HZ", "60000"))

# File paths
BASE_DIR = Path(__file__).parent.parent.parent
DATA_DIR = BASE_DIR / "data"
RECORDINGS_DIR = DATA_DIR / "recordings"

# WebSocket
WS_BUFFER_SIZE = int(os.getenv("WS_BUFFER_SIZE", "10"))
SDR_INGEST_TOKEN = os.getenv("SDR_INGEST_TOKEN", "")
IQ_MAX_FRAME_BYTES = int(os.getenv("IQ_MAX_FRAME_BYTES", str(2 * 1024 * 1024)))
SDR_ENABLE_ZMQ = os.getenv("SDR_ENABLE_ZMQ", "0") == "1"

# Recording — keep small on the 30 GB VPS (auto IQ can fill the disk overnight)
MAX_RECORDING_SIZE_GB = float(os.getenv("MAX_RECORDING_SIZE_GB", "1.0"))

# Idle waterfall spectrum (nothing.iq / noise). Off by default: on a single
# uvicorn worker it starves /api/* and makes the whole site freeze.
SDR_IDLE_SPECTRUM = os.getenv("SDR_IDLE_SPECTRUM", "0") == "1"

# Ensure directories exist
RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)
