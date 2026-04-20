"""Playback service for historical IQ data with timeline support."""
import os
import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, List
import numpy as np
from pathlib import Path

logger = logging.getLogger(__name__)


class PlaybackService:
    """Service for playing back historical IQ recordings."""
    
    def __init__(self, recordings_dir: str = "data/recordings", silence_dir: str = "data/silence"):
        self.recordings_dir = Path(recordings_dir)
        self.silence_dir = Path(silence_dir)
        
        self.is_playing = False
        self.current_time: Optional[datetime] = None
        self.playback_speed = 1.0
        self.sample_rate = 625000  # System sample rate (625 kHz)
        
        # Silence file for gaps
        self.silence_file = self.silence_dir / "nothing.iq"
        self.silence_data: Optional[np.ndarray] = None
        self.silence_duration = 300  # 5 minutes in seconds
        
        # Last pass parameters for silence playback
        self.last_pass_center_frequency = 433060000  # 433 MHz + 60 kHz
        self.last_pass_sample_rate = 625000
        
        # Playback state
        self._playback_task: Optional[asyncio.Task] = None
        self._sample_callback = None
        
        # Load silence data
        self._load_silence_data()
    
    def _load_silence_data(self):
        """Load silence/nothing.iq file."""
        try:
            logger.info(f"Looking for silence file at: {self.silence_file}")
            if self.silence_file.exists():
                file_size = self.silence_file.stat().st_size
                logger.info(f"Found silence file, size: {file_size} bytes")
                
                with open(self.silence_file, 'rb') as f:
                    data = f.read()
                    self.silence_data = np.frombuffer(data, dtype=np.complex64)
                    
                    logger.info(f"Loaded {len(self.silence_data)} samples from silence file")
                    
                    # Calculate duration based on sample rate
                    duration = len(self.silence_data) / self.sample_rate
                    logger.info(f"Silence duration: {duration:.1f}s at {self.sample_rate} Hz")
                    
            else:
                # Generate silence if file doesn't exist
                logger.warning(f"Silence file not found at {self.silence_file}")
                silence_samples = int(self.sample_rate * self.silence_duration)
                self.silence_data = np.zeros(silence_samples, dtype=np.complex64)
                logger.warning(f"Generated {silence_samples} zero samples at {self.sample_rate} Hz")
        except Exception as e:
            logger.error(f"Error loading silence data: {e}")
            # Fallback to generated silence
            silence_samples = int(self.sample_rate * self.silence_duration)
            self.silence_data = np.zeros(silence_samples, dtype=np.complex64)
            logger.error(f"Using fallback: generated {silence_samples} zero samples")
    
    def set_sample_callback(self, callback):
        """Set callback for processed samples."""
        self._sample_callback = callback
    
    def update_last_pass_params(self, center_frequency: int, sample_rate: int = 625000):
        """Update parameters from last satellite pass for silence playback."""
        self.last_pass_center_frequency = center_frequency
        self.last_pass_sample_rate = sample_rate
        logger.info(f"Updated last pass params: center={center_frequency/1e6:.3f} MHz, rate={sample_rate}")
    
    def _get_recording_params_for_time(self, target_time: datetime) -> Dict:
        """Get recording parameters (frequency, sample_rate) for specific time."""
        # TODO: В будущем можно сохранять метаданные записей с параметрами
        # Пока используем параметры последнего пролета для всех записей
        return {
            "center_frequency": self.last_pass_center_frequency,
            "sample_rate": self.sample_rate
        }
    
    def get_current_playback_params(self, is_silence: bool = False) -> Dict:
        """Get current playback parameters for FFT display."""
        if is_silence:
            # Use last pass parameters for silence (заглушка на частоте последнего пролета)
            return {
                "center_frequency": self.last_pass_center_frequency,
                "sample_rate": self.last_pass_sample_rate
            }
        else:
            # For recordings, get parameters for current time
            recording_params = self._get_recording_params_for_time(self.current_time)
            return recording_params
    
    async def start_playback(self, start_time: datetime):
        """Start playback from specified time."""
        if self.is_playing:
            await self.stop_playback()
        
        self.current_time = start_time
        self.is_playing = True
        
        self._playback_task = asyncio.create_task(self._playback_loop())
        logger.info(f"Started playback from {start_time}")
    
    async def stop_playback(self):
        """Stop current playback."""
        self.is_playing = False
        
        if self._playback_task:
            self._playback_task.cancel()
            try:
                await self._playback_task
            except asyncio.CancelledError:
                pass
            self._playback_task = None
        
        logger.info("Stopped playback")
    
    async def seek_to_time(self, target_time: datetime):
        """Seek to specific time."""
        was_playing = self.is_playing
        
        if was_playing:
            await self.stop_playback()
        
        self.current_time = target_time
        
        # Check if we're seeking to a recording or silence
        recording = self._find_recording_for_time(target_time)
        if recording:
            logger.info(f"Seeked to recording at {target_time}")
            # Update parameters for this recording
            recording_params = self._get_recording_params_for_time(target_time)
            logger.info(f"Recording params: {recording_params}")
        else:
            logger.info(f"Seeked to silence at {target_time}")
            # Will use silence parameters
        
        if was_playing:
            await self.start_playback(target_time)
        
        logger.info(f"Seeked to {target_time}")
    
    def get_playback_state(self) -> Dict:
        """Get current playback state."""
        return {
            "is_playing": self.is_playing,
            "current_time": self.current_time.isoformat() if self.current_time else None,
            "playback_speed": self.playback_speed
        }
    
    async def _playback_loop(self):
        """Main playback loop - send samples at real-time rate."""
        samples_per_chunk = 1024  # Send 1024 samples at a time
        chunk_duration = samples_per_chunk / self.sample_rate  # Time for this chunk
        
        try:
            while self.is_playing and self.current_time:
                # Get samples for current time
                samples, is_silence = await self._get_samples_for_timerange(
                    self.current_time, 
                    self.current_time + timedelta(seconds=chunk_duration)
                )
                
                # Send samples to callback
                if self._sample_callback and len(samples) > 0:
                    # Set playback parameters
                    playback_params = self.get_current_playback_params(is_silence)
                    
                    # Ensure we have the right number of samples
                    if len(samples) > samples_per_chunk:
                        samples = samples[:samples_per_chunk]
                    elif len(samples) < samples_per_chunk:
                        # Pad with zeros if needed
                        padding = np.zeros(samples_per_chunk - len(samples), dtype=np.complex64)
                        samples = np.concatenate([samples, padding])
                    
                    # Call callback
                    if asyncio.iscoroutinefunction(self._sample_callback):
                        await self._sample_callback(samples, playback_params)
                    else:
                        await asyncio.get_event_loop().run_in_executor(
                            None, self._sample_callback, samples, playback_params
                        )
                
                # Advance time
                self.current_time += timedelta(seconds=chunk_duration)
                
                # Sleep for real-time playback
                await asyncio.sleep(chunk_duration / self.playback_speed)
                
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Error in playback loop: {e}")
    
    async def _get_samples_for_timerange(self, start_time: datetime, end_time: datetime) -> tuple[np.ndarray, bool]:
        """Get IQ samples for specified time range. Returns (samples, is_silence)."""
        try:
            # Find recording that covers this time range
            recording = self._find_recording_for_time(start_time)
            
            if recording:
                # Load samples from recording file
                samples = await self._load_samples_from_recording(recording, start_time, end_time)
                logger.debug(f"Loaded {len(samples)} samples from recording for {start_time}")
                return samples, False  # Real recording data
            else:
                # Use silence data for gaps
                samples = self._get_silence_samples(start_time, end_time)
                logger.debug(f"Generated {len(samples)} silence samples for {start_time}")
                return samples, True  # Silence data
                
        except Exception as e:
            logger.error(f"Error getting samples for {start_time}: {e}")
            samples = self._get_silence_samples(start_time, end_time)
            return samples, True
    
    def _find_recording_for_time(self, target_time: datetime) -> Optional[Dict]:
        """Find recording file that contains the target time."""
        try:
            # Ensure target_time is timezone-naive for comparison
            if target_time.tzinfo is not None:
                target_time = target_time.replace(tzinfo=None)
            
            for file_path in self.recordings_dir.glob("*.iq"):
                try:
                    # Parse filename to get start time
                    filename = file_path.stem  # Remove .iq extension
                    if len(filename) == 15 and filename[8] == '_':  # YYYYMMDD_HHMMSS format
                        file_start_time = datetime.strptime(filename, "%Y%m%d_%H%M%S")
                        
                        # Calculate file duration based on size
                        file_size = file_path.stat().st_size
                        samples_count = file_size // 8  # complex64 = 8 bytes
                        duration_seconds = samples_count / self.sample_rate
                        file_end_time = file_start_time + timedelta(seconds=duration_seconds)
                        
                        # Check if target time is within this recording
                        if file_start_time <= target_time <= file_end_time:
                            return {
                                "filepath": file_path,
                                "start_time": file_start_time,
                                "end_time": file_end_time,
                                "duration_seconds": duration_seconds
                            }
                            
                except Exception as e:
                    logger.error(f"Error processing file {file_path}: {e}")
                    continue
            
            return None
            
        except Exception as e:
            logger.error(f"Error finding recording: {e}")
            return None
    
    async def _load_samples_from_recording(self, recording: Dict, start_time: datetime, end_time: datetime) -> np.ndarray:
        """Load samples from recording file for specified time range."""
        try:
            filepath = recording["filepath"]
            recording_start = recording["start_time"]
            
            # Ensure all datetime objects are timezone-naive
            if start_time.tzinfo is not None:
                start_time = start_time.replace(tzinfo=None)
            if end_time.tzinfo is not None:
                end_time = end_time.replace(tzinfo=None)
            
            # Calculate byte offset and length
            time_offset = (start_time - recording_start).total_seconds()
            time_length = (end_time - start_time).total_seconds()
            
            sample_offset = int(time_offset * self.sample_rate)
            sample_length = int(time_length * self.sample_rate)
            
            byte_offset = sample_offset * 8  # complex64 = 8 bytes
            byte_length = sample_length * 8
            
            # Read data from file
            def read_file_chunk():
                with open(filepath, 'rb') as f:
                    f.seek(byte_offset)
                    data = f.read(byte_length)
                    return np.frombuffer(data, dtype=np.complex64)
            
            # Run file I/O in thread pool
            samples = await asyncio.get_event_loop().run_in_executor(None, read_file_chunk)
            return samples
            
        except Exception as e:
            logger.error(f"Error loading samples from recording: {e}")
            return self._get_silence_samples(start_time, end_time)
    
    def _get_silence_samples(self, start_time: datetime, end_time: datetime) -> np.ndarray:
        """Get silence samples for specified time range."""
        try:
            duration = (end_time - start_time).total_seconds()
            sample_count = int(duration * self.sample_rate)
            
            if self.silence_data is not None and len(self.silence_data) > 0:
                # Simple cycling through silence data
                repeats = (sample_count // len(self.silence_data)) + 1
                repeated_silence = np.tile(self.silence_data, repeats)
                return repeated_silence[:sample_count]
            else:
                # Generate zeros if no silence data
                return np.zeros(sample_count, dtype=np.complex64)
                
        except Exception as e:
            logger.error(f"Error generating silence samples: {e}")
            return np.zeros(1024, dtype=np.complex64)  # Fallback
    
    def is_recording_available(self, target_time: datetime) -> bool:
        """Check if recording is available for specified time."""
        return self._find_recording_for_time(target_time) is not None


# Global playback service instance — use absolute paths so it works
# whether launched from sdr_web_test/ or from the project root.
_SDR_BASE = Path(__file__).parent.parent.parent
playback_service = PlaybackService(
    recordings_dir=str(_SDR_BASE / "data" / "recordings"),
    silence_dir=str(_SDR_BASE / "data" / "silence"),
)