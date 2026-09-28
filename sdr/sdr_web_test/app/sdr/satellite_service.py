"""Service for satellite data management."""
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from .config import CENTER_FREQUENCY_OFFSET_HZ, DEFAULT_CENTER_FREQUENCY, DATA_DIR
from .models import SatelliteData, SatellitePass


class SatelliteService:
    """Service for managing satellite data and finding active/upcoming passes."""

    def __init__(self, satellites_file: str | None = None):
        self.satellites_file = (
            Path(satellites_file) if satellites_file else Path(__file__).with_name("satellites.json")
        )
        self._satellites_cache: Optional[Dict[str, SatelliteData]] = None
        self._passes_cache: List[SatellitePass] = []
        self._passes_file = DATA_DIR / "passes.json"
        if self._passes_file.exists():
            try:
                data = json.loads(self._passes_file.read_text(encoding="utf-8"))
                self._passes_cache = [SatellitePass.model_validate(item) for item in data]
            except (OSError, ValueError) as exc:
                print(f"Warning: Could not load satellite passes: {exc}")

    def load_satellites(self) -> Dict[str, SatelliteData]:
        """Load satellite data from JSON file."""
        if self._satellites_cache is not None:
            return self._satellites_cache

        try:
            with open(self.satellites_file, "r", encoding="utf-8") as f:
                data = json.load(f)

            satellites = {}
            for sat_name, sat_data in data.get("satellites", {}).items():
                satellites[sat_name] = SatelliteData(**sat_data)

            self._satellites_cache = satellites
            return satellites
        except FileNotFoundError:
            print(f"Warning: Satellites file {self.satellites_file} not found")
            return {}
        except Exception as e:
            print(f"Error loading satellites: {e}")
            return {}

    def get_satellite(self, name: str) -> Optional[SatelliteData]:
        """Get satellite data by name, allowing small formatting differences."""
        satellites = self.load_satellites()
        satellite = satellites.get(name)
        if satellite:
            return satellite

        normalized_name = self._normalize_satellite_name(name)
        for sat_name, sat_data in satellites.items():
            if self._normalize_satellite_name(sat_name) == normalized_name:
                return sat_data
        return None

    def get_all_satellites(self) -> Dict[str, SatelliteData]:
        """Get all satellite data."""
        return self.load_satellites()

    def set_passes(self, passes: List[SatellitePass]):
        """Persist a refreshed pass schedule for service restarts."""
        normalized = [item.model_copy(update={
            "aos_time": self._to_utc(item.aos_time),
            "los_time": self._to_utc(item.los_time),
        }) for item in passes]
        payload = json.dumps([item.model_dump(mode="json") for item in normalized], ensure_ascii=False)
        self._passes_file.parent.mkdir(parents=True, exist_ok=True)
        temporary = self._passes_file.with_suffix(".json.tmp")
        temporary.write_text(payload, encoding="utf-8")
        temporary.replace(self._passes_file)
        self._passes_cache = normalized

    def get_passes(self) -> List[SatellitePass]:
        return self._passes_cache.copy()

    def get_next_pass(self) -> Optional[SatellitePass]:
        """Get the next upcoming satellite pass."""
        return self.get_active_or_next_pass(active_first=False)

    def get_active_or_next_pass(self, active_first: bool = True) -> Optional[SatellitePass]:
        """Get the current pass if active, otherwise the next upcoming pass."""
        if not self._passes_cache:
            return None

        now = datetime.now(timezone.utc)

        if active_first:
            active_passes = [
                pass_info for pass_info in self._passes_cache
                if self._to_utc(pass_info.aos_time) <= now <= self._to_utc(pass_info.los_time)
            ]
            if active_passes:
                active_passes.sort(key=lambda p: self._to_utc(p.los_time))
                return active_passes[0]

        upcoming_passes = [
            pass_info for pass_info in self._passes_cache
            if self._to_utc(pass_info.aos_time) > now
        ]
        if not upcoming_passes:
            return None

        upcoming_passes.sort(key=lambda p: self._to_utc(p.aos_time))
        return upcoming_passes[0]

    def get_current_satellite_data(self) -> Optional[SatelliteData]:
        """Get satellite data for the active or next upcoming pass."""
        pass_info = self.get_active_or_next_pass()
        if not pass_info:
            return None

        return self.get_satellite(pass_info.satellite_name)

    def calculate_center_frequency(self, satellite_frequency: int) -> int:
        """Calculate center frequency from the base satellite frequency."""
        return satellite_frequency + CENTER_FREQUENCY_OFFSET_HZ

    def get_center_frequency(self, satellite_name: str, pass_frequency: Optional[int] = None) -> int:
        """Resolve center frequency from satellites.json, then pass frequency, then default."""
        satellite = self.get_satellite(satellite_name)
        if satellite:
            if satellite.center_frequency:
                return satellite.center_frequency
            return self.calculate_center_frequency(satellite.frequency)
        if pass_frequency:
            return self.calculate_center_frequency(pass_frequency)
        return DEFAULT_CENTER_FREQUENCY

    def get_center_frequency_for_pass(self, pass_info: Optional[SatellitePass]) -> int:
        """Resolve center frequency for a pass."""
        if not pass_info:
            return DEFAULT_CENTER_FREQUENCY
        return self.get_center_frequency(pass_info.satellite_name, pass_info.frequency)

    @staticmethod
    def _normalize_satellite_name(name: str) -> str:
        return re.sub(r"[^a-z0-9]+", "", name.lower())

    @staticmethod
    def _to_utc(value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


satellite_service = SatelliteService()
