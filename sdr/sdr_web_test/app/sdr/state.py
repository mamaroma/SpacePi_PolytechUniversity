"""Global state management for SDR streaming application."""
import asyncio
import time
from datetime import datetime, timezone
from typing import Optional, List
from .models import SignalInfo, SatellitePass, RecordingState, SystemInfo, SpectrumParams


class SDRState:
    """Centralized state management for SDR system."""
    
    def __init__(self):
        self.spectrum_params: Optional[SpectrumParams] = None
        self.satellite_passes: List[SatellitePass] = []
        self.recording_state = RecordingState()
        self.zmq_connected = False
        self.station_connection_id: Optional[str] = None
        self.station_id: Optional[str] = None
        self.station_sample_rate: Optional[int] = None
        self.station_center_frequency: Optional[int] = None
        self.station_satellite_name: Optional[str] = None
        self.last_iq_at: Optional[datetime] = None
        self._last_iq_monotonic = 0.0
        self.frames_received = 0
        self.samples_received = 0
        self.local_last_iq_at: Optional[datetime] = None
        self._local_last_iq_monotonic = 0.0
        self.local_frames_received = 0
        self.local_samples_received = 0
        self._lock = asyncio.Lock()

    async def claim_station(self, connection_id: str) -> bool:
        """Only one station may feed the shared live spectrum at a time."""
        async with self._lock:
            if self.station_connection_id is not None:
                return False
            self.station_connection_id = connection_id
            self.station_id = "Наземная станция"
            self.station_sample_rate = None
            self.station_center_frequency = None
            self.station_satellite_name = None
            self.last_iq_at = None
            self._last_iq_monotonic = 0.0
            self.frames_received = 0
            self.samples_received = 0
            return True

    async def set_station_metadata(self, connection_id: str, metadata: dict) -> None:
        async with self._lock:
            if self.station_connection_id != connection_id:
                return
            self.station_id = metadata["station_id"]
            self.station_sample_rate = metadata.get("sample_rate")
            self.station_center_frequency = metadata.get("center_frequency")
            self.station_satellite_name = metadata.get("satellite_name")

    async def note_iq_frame(self, connection_id: str, sample_count: int) -> None:
        async with self._lock:
            if self.station_connection_id != connection_id:
                return
            self.last_iq_at = datetime.now(timezone.utc)
            self._last_iq_monotonic = time.monotonic()
            self.frames_received += 1
            self.samples_received += sample_count

    async def release_station(self, connection_id: str) -> None:
        async with self._lock:
            if self.station_connection_id == connection_id:
                self.station_connection_id = None

    async def note_local_iq_frame(self, sample_count: int) -> None:
        async with self._lock:
            self.local_last_iq_at = datetime.now(timezone.utc)
            self._local_last_iq_monotonic = time.monotonic()
            self.local_frames_received += 1
            self.local_samples_received += sample_count

    async def get_stream_status(self) -> dict:
        async with self._lock:
            remote_connected = self.station_connection_id is not None
            remote_live = remote_connected and time.monotonic() - self._last_iq_monotonic < 2.5
            local_live = self.zmq_connected and time.monotonic() - self._local_last_iq_monotonic < 2.5
            connected = remote_connected or local_live
            streaming = remote_live or (not remote_connected and local_live)
            use_local = not remote_connected and local_live
            last_frame = self.local_last_iq_at if use_local else self.last_iq_at
            return {
                "station_connected": connected,
                "streaming": streaming,
                "source": "zmq" if use_local else "station" if remote_live else "demo",
                "station_id": "Локальный ZMQ" if use_local else self.station_id,
                "sample_rate": self.station_sample_rate if not use_local else None,
                "center_frequency": self.station_center_frequency if not use_local else None,
                "satellite_name": self.station_satellite_name if not use_local else None,
                "last_frame_at": last_frame.isoformat() if last_frame else None,
                "frames_received": self.local_frames_received if use_local else self.frames_received,
                "samples_received": self.local_samples_received if use_local else self.samples_received,
            }
    
    async def update_spectrum_params(self, params: SpectrumParams):
        """Update spectrum parameters."""
        async with self._lock:
            self.spectrum_params = params
    
    async def get_spectrum_params(self) -> Optional[SpectrumParams]:
        """Get current spectrum parameters."""
        async with self._lock:
            return self.spectrum_params
    
    async def update_satellite_passes(self, passes: List[SatellitePass]):
        """Update satellite pass list."""
        async with self._lock:
            self.satellite_passes = passes
    
    async def get_satellite_passes(self) -> List[SatellitePass]:
        """Get current satellite passes."""
        async with self._lock:
            return self.satellite_passes.copy()
    
    async def start_recording(self, filename: str):
        """Start recording."""
        async with self._lock:
            self.recording_state.is_recording = True
            self.recording_state.filename = filename
            self.recording_state.start_time = datetime.now(timezone.utc)
            self.recording_state.file_size_bytes = 0
    
    async def stop_recording(self):
        """Stop recording."""
        async with self._lock:
            self.recording_state.is_recording = False
            self.recording_state.filename = None
            self.recording_state.start_time = None
    
    async def update_recording_size(self, size_bytes: int):
        """Update recording file size."""
        async with self._lock:
            self.recording_state.file_size_bytes = size_bytes
    
    async def get_recording_state(self) -> RecordingState:
        """Get current recording state."""
        async with self._lock:
            return RecordingState(**self.recording_state.dict())
    
    async def set_zmq_connected(self, connected: bool):
        """Set ZMQ connection status."""
        async with self._lock:
            self.zmq_connected = connected
    
    async def get_system_info(self) -> SystemInfo:
        """Get system information."""
        async with self._lock:
            return SystemInfo(
                zmq_connected=self.zmq_connected and time.monotonic() - self._local_last_iq_monotonic < 2.5,
                recording_state=RecordingState(**self.recording_state.dict()),
                signal_info=None  # Signal info is now dynamically generated
            )


# Global state instance
sdr_state = SDRState()
