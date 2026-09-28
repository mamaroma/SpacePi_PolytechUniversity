"""Small sidecars preserve the SDR settings used by each IQ recording."""
import json
from datetime import datetime, timezone
from pathlib import Path

from .config import DEFAULT_CENTER_FREQUENCY, DEFAULT_SAMPLE_RATE


def sidecar_path(recording_path: Path) -> Path:
    return recording_path.with_suffix(".iq.json")


def recording_start_time(recording_path: Path) -> datetime:
    stem = recording_path.stem
    if len(stem) >= 22 and stem[15] == "_" and stem[16:22].isdigit():
        started = datetime.strptime(stem[:22], "%Y%m%d_%H%M%S_%f")
    else:
        started = datetime.strptime(stem[:15], "%Y%m%d_%H%M%S")
    return started.replace(tzinfo=timezone.utc)


def write_metadata(recording_path: Path, sample_rate: int, center_frequency: int) -> None:
    sidecar_path(recording_path).write_text(json.dumps({
        "sample_rate": sample_rate,
        "center_frequency": center_frequency,
    }), encoding="utf-8")


def read_metadata(recording_path: Path) -> dict:
    defaults = {
        "sample_rate": DEFAULT_SAMPLE_RATE,
        "center_frequency": DEFAULT_CENTER_FREQUENCY,
    }
    try:
        data = json.loads(sidecar_path(recording_path).read_text(encoding="utf-8"))
        sample_rate = int(data["sample_rate"])
        center_frequency = int(data["center_frequency"])
        if not (1 <= sample_rate <= 20_000_000 and 1 <= center_frequency <= 10_000_000_000):
            return defaults
        return {"sample_rate": sample_rate, "center_frequency": center_frequency}
    except (OSError, ValueError, TypeError, KeyError):
        return defaults
