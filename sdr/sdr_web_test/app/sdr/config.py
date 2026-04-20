"""Configuration settings for SDR streaming application."""
import os
from pathlib import Path

# FFT Configuration (defaults, can be overridden via API)
DEFAULT_FFT_SIZE = int(os.getenv("DEFAULT_FFT_SIZE", "1024"))
DEFAULT_FFT_UPDATE_RATE = int(os.getenv("DEFAULT_FFT_UPDATE_RATE", "60"))  # FPS

# ZeroMQ Configuration
ZMQ_ADDRESS = os.getenv("ZMQ_ADDRESS", "tcp://localhost:5555")
ZMQ_TIMEOUT = int(os.getenv("ZMQ_TIMEOUT", "1000"))  # milliseconds

# Signal defaults
DEFAULT_SAMPLE_RATE = int(os.getenv("DEFAULT_SAMPLE_RATE", "625000"))  # 625 kHz
DEFAULT_CENTER_FREQUENCY = int(os.getenv("DEFAULT_CENTER_FREQUENCY", "433060000"))  # 433.06 MHz

# File paths
BASE_DIR = Path(__file__).parent.parent.parent
DATA_DIR = BASE_DIR / "data"
RECORDINGS_DIR = DATA_DIR / "recordings"

# WebSocket
WS_BUFFER_SIZE = int(os.getenv("WS_BUFFER_SIZE", "10"))

# Recording
MAX_RECORDING_SIZE_GB = float(os.getenv("MAX_RECORDING_SIZE_GB", "10.0"))

# Ensure directories exist
RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)