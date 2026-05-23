"""Data models for SDR streaming application."""
from datetime import datetime, timezone
from typing import Optional, List
from pydantic import BaseModel, Field


class SatelliteData(BaseModel):
    """Satellite signal characteristics stored on server."""
    name: str
    frequency: int  # Base satellite frequency
    center_frequency: Optional[int] = None  # Receiver center frequency, if manually configured
    bandwidth: float  # in kHz
    spreading_factor: str = "SF8"
    coding_rate: str = "4/6"
    sync_word: str = "0x12"
    preamble_length: int = 8
    crc_enabled: bool = True


class SpectrumParams(BaseModel):
    """Optional manual override for FFT display parameters."""
    center_frequency: int  # Always satellite_frequency + 60000
    sample_rate: int = 625000
    fft_size: int = 1024
    fps: int = 60


class SignalInfo(BaseModel):
    """Combined signal info for display - satellite data + spectrum params."""
    # Spectrum parameters (calculated)
    center_frequency: int  # satellite_frequency + 60000
    sample_rate: int = 625000
    fft_size: int = 1024
    fps: int = 60
    
    # Satellite parameters (from server data)
    satellite_name: str
    frequency: int  # Base satellite frequency
    bandwidth: float  # in kHz
    spreading_factor: str = "SF8"
    coding_rate: str = "4/6"
    sync_word: str = "0x12"
    preamble_length: int = 8
    crc_enabled: bool = True
    
    # Metadata
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SatellitePass(BaseModel):
    """Satellite pass information model."""
    satellite_name: str
    aos_time: datetime  # Acquisition of Signal
    los_time: datetime  # Loss of Signal
    max_elevation: float
    frequency: Optional[int] = None
    band: Optional[str] = None
    notes: Optional[str] = None


class PassList(BaseModel):
    """List of satellite passes."""
    passes: List[SatellitePass]


class RecordingState(BaseModel):
    """Recording state model."""
    is_recording: bool = False
    filename: Optional[str] = None
    start_time: Optional[datetime] = None
    file_size_bytes: int = 0


class FFTFrame(BaseModel):
    """FFT spectrum frame model."""
    timestamp: datetime
    fft_data: List[float]  # Magnitude in dB
    sample_rate: int
    center_frequency: int


class SystemInfo(BaseModel):
    """System information model."""
    version: str = "1.0.0"
    zmq_connected: bool = False
    recording_state: RecordingState = RecordingState()
    signal_info: Optional[SignalInfo] = None
