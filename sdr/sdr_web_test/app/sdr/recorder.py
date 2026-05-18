"""IQ recording functionality."""
import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
import numpy as np
from .config import RECORDINGS_DIR, MAX_RECORDING_SIZE_GB
from .state import sdr_state

logger = logging.getLogger(__name__)


class IQRecorder:
    """Handles IQ sample recording to files."""
    
    def __init__(self):
        self.recording_file: Optional[Path] = None
        self.file_handle = None
        self._lock = asyncio.Lock()
    
    def generate_filename(self) -> str:
        """Generate recording filename based on current datetime."""
        now = datetime.now(timezone.utc)
        return f"{now.strftime('%Y%m%d_%H%M%S')}.iq"
    
    async def start_recording(self) -> str:
        """Start recording IQ samples."""
        async with self._lock:
            if self.file_handle is not None:
                raise RuntimeError("Recording already in progress")
            
            filename = self.generate_filename()
            self.recording_file = RECORDINGS_DIR / filename
            
            try:
                self.file_handle = open(self.recording_file, 'wb')
                await sdr_state.start_recording(filename)
                logger.info(f"Started recording to {filename}")
                return filename
            except Exception as e:
                logger.error(f"Failed to start recording: {e}")
                self.file_handle = None
                self.recording_file = None
                raise
    
    async def stop_recording(self):
        """Stop recording IQ samples."""
        async with self._lock:
            if self.file_handle is None:
                raise RuntimeError("No recording in progress")
            
            filename = self.recording_file.name if self.recording_file else None
            
            try:
                self.file_handle.close()
                file_size = self.recording_file.stat().st_size if self.recording_file else 0
                logger.info(f"Stopped recording. File size: {file_size} bytes")
                
                await sdr_state.stop_recording()
                
                return filename
                
            except Exception as e:
                logger.error(f"Error stopping recording: {e}")
                raise
            finally:
                self.file_handle = None
                self.recording_file = None
    
    async def write_samples(self, samples: np.ndarray):
        """Write IQ samples to file if recording."""
        async with self._lock:
            if self.file_handle is None:
                return
            
            try:
                # Convert complex64 to bytes
                samples_bytes = samples.astype(np.complex64).tobytes()
                self.file_handle.write(samples_bytes)
                self.file_handle.flush()
                
                # Update file size in state
                if self.recording_file:
                    current_size = self.recording_file.stat().st_size
                    await sdr_state.update_recording_size(current_size)
                    
                    # Check file size limit
                    max_size_bytes = MAX_RECORDING_SIZE_GB * 1024 * 1024 * 1024
                    if current_size > max_size_bytes:
                        logger.warning(f"Recording file size exceeded {MAX_RECORDING_SIZE_GB}GB, stopping")
                        await self.stop_recording()
                        
            except Exception as e:
                logger.error(f"Error writing samples: {e}")
                # Don't raise here to avoid breaking the signal processing pipeline
    
    async def is_recording(self) -> bool:
        """Check if currently recording."""
        async with self._lock:
            return self.file_handle is not None


# Global recorder instance
iq_recorder = IQRecorder()
