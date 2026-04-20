"""Global state management for SDR streaming application."""
import asyncio
from datetime import datetime
from typing import Optional, List
from .models import SignalInfo, SatellitePass, RecordingState, SystemInfo, SpectrumParams


class SDRState:
    """Centralized state management for SDR system."""
    
    def __init__(self):
        self.spectrum_params: Optional[SpectrumParams] = None
        self.satellite_passes: List[SatellitePass] = []
        self.recording_state = RecordingState()
        self.zmq_connected = False
        self._lock = asyncio.Lock()
    
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
            self.recording_state.start_time = datetime.now()
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
                zmq_connected=self.zmq_connected,
                recording_state=RecordingState(**self.recording_state.dict()),
                signal_info=None  # Signal info is now dynamically generated
            )


# Global state instance
sdr_state = SDRState()