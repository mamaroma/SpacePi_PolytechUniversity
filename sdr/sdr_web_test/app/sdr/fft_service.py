"""FFT processing and WebSocket streaming service."""
import asyncio
import logging
import numpy as np
from datetime import datetime
from typing import Set, List, Dict, Optional
from fastapi import WebSocket
from .config import DEFAULT_FFT_SIZE, DEFAULT_FFT_UPDATE_RATE, DEFAULT_SAMPLE_RATE, DEFAULT_CENTER_FREQUENCY
from .models import FFTFrame
from .state import sdr_state
from .recorder import iq_recorder
from .auto_recorder import auto_recorder

logger = logging.getLogger(__name__)


class FFTService:
    """Handles FFT processing and WebSocket streaming."""
    
    def __init__(self):
        self.websocket_clients: Set[WebSocket] = set()
        self.sample_buffer = np.array([], dtype=np.complex64)
        
        # Dynamic parameters (updated from signal info or playback)
        self.fft_size = DEFAULT_FFT_SIZE
        self.fps = DEFAULT_FFT_UPDATE_RATE
        self.sample_rate = DEFAULT_SAMPLE_RATE
        self.center_frequency = DEFAULT_CENTER_FREQUENCY
        
        # Playback mode parameters
        self.is_playback_mode = False
        self.playback_params = None
        
        self._lock = asyncio.Lock()
        self.fft_window = np.hanning(self.fft_size)
        self.last_update_time = 0
    
    async def add_websocket_client(self, websocket: WebSocket):
        """Add WebSocket client for FFT streaming."""
        async with self._lock:
            self.websocket_clients.add(websocket)
            logger.info(f"Added WebSocket client. Total clients: {len(self.websocket_clients)}")
    
    async def remove_websocket_client(self, websocket: WebSocket):
        """Remove WebSocket client."""
        async with self._lock:
            self.websocket_clients.discard(websocket)
            logger.info(f"Removed WebSocket client. Total clients: {len(self.websocket_clients)}")
    
    async def update_parameters(self):
        """Update FFT parameters from spectrum params."""
        spectrum_params = await sdr_state.get_spectrum_params()
        if spectrum_params:
            async with self._lock:
                # Update parameters if they changed
                if (self.fft_size != spectrum_params.fft_size or 
                    self.fps != spectrum_params.fps or
                    self.sample_rate != spectrum_params.sample_rate or
                    self.center_frequency != spectrum_params.center_frequency):
                    
                    self.fft_size = spectrum_params.fft_size
                    self.fps = spectrum_params.fps
                    self.sample_rate = spectrum_params.sample_rate
                    self.center_frequency = spectrum_params.center_frequency
                    
                    # Recreate window function if FFT size changed
                    self.fft_window = np.hanning(self.fft_size)
                    
                    # Clear buffer to avoid size mismatch
                    self.sample_buffer = np.array([], dtype=np.complex64)
                    
                    logger.info(f"Updated FFT parameters: size={self.fft_size}, fps={self.fps}, center={self.center_frequency/1e6:.3f} MHz")
        else:
            # Если параметры спектра не заданы, используем значения по умолчанию (только один раз)
            if not hasattr(self, '_default_warning_shown'):
                logger.warning("No spectrum parameters found, using defaults")
                self._default_warning_shown = True
    
    def update_last_pass_frequency(self, center_frequency: int):
        """Update last pass center frequency for silence playback."""
        from .playback_service import playback_service
        playback_service.update_last_pass_params(center_frequency, self.sample_rate)
        logger.info(f"Updated last pass frequency: {center_frequency/1e6:.3f} MHz")
    
    async def process_samples(self, samples: np.ndarray, playback_params: Optional[Dict] = None):
        """Process incoming IQ samples."""
        # Update parameters from spectrum params (только изредка, не каждый раз)
        if not hasattr(self, '_last_param_update'):
            self._last_param_update = 0
        
        current_time = datetime.now().timestamp()
        if current_time - self._last_param_update > 5.0:  # Обновляем параметры раз в 5 секунд
            await self.update_parameters()
            self._last_param_update = current_time
        
        # Handle playback mode parameters
        if playback_params:
            self.is_playback_mode = True
            self.playback_params = playback_params
            # Override center frequency for playback
            async with self._lock:
                self.center_frequency = playback_params.get('center_frequency', self.center_frequency)
                self.sample_rate = playback_params.get('sample_rate', self.sample_rate)
        else:
            self.is_playback_mode = False
            self.playback_params = None
        
        # Record samples if recording is active (only for live data)
        if not self.is_playback_mode:
            await iq_recorder.write_samples(samples)
            # Auto-record samples (always active for live data)
            await auto_recorder.process_samples(samples)
        
        # Add samples to buffer
        async with self._lock:
            self.sample_buffer = np.concatenate([self.sample_buffer, samples])
            
            # Limit buffer size to prevent excessive delay
            max_buffer_size = self.fft_size * 3  # Keep max 3 frames worth of data
            if len(self.sample_buffer) > max_buffer_size:
                # Remove oldest samples to maintain real-time processing
                excess = len(self.sample_buffer) - max_buffer_size
                self.sample_buffer = self.sample_buffer[excess:]
            
            # Check if enough time has passed for next frame (FPS control)
            # Skip FPS control for silence playback to ensure smooth operation
            frame_interval = 1.0 / self.fps
            should_process = (current_time - self.last_update_time >= frame_interval) or self.is_playback_mode
            
            if should_process:
                # Process FFT frames while we have enough samples
                if len(self.sample_buffer) >= self.fft_size:
                    await self._process_fft_frame()
                    self.last_update_time = current_time
                    # Debug info every 100 frames
                    if hasattr(self, '_frame_count'):
                        self._frame_count += 1
                    else:
                        self._frame_count = 1
                    
                    if self._frame_count % 100 == 0:
                        logger.info(f"Processed {self._frame_count} FFT frames, {len(self.websocket_clients)} clients connected")
    
    async def _process_fft_frame(self):
        """Process one FFT frame from buffer."""
        # Extract FFT_SIZE samples from buffer (with overlap for better display)
        overlap = self.fft_size // 4  # 25% overlap
        frame_samples = self.sample_buffer[:self.fft_size]
        self.sample_buffer = self.sample_buffer[self.fft_size - overlap:]  # Keep some overlap
        
        # Apply window function
        windowed_samples = frame_samples * self.fft_window
        
        # Compute FFT
        fft_result = np.fft.fftshift(np.fft.fft(windowed_samples))
        
        # Convert to magnitude in dB (optimized)
        magnitude = np.abs(fft_result)
        magnitude = np.maximum(magnitude, 1e-12)  # Faster than np.where
        magnitude_db = 20 * np.log10(magnitude)
        
        # Create FFT frame
        fft_frame = FFTFrame(
            timestamp=datetime.now(),
            fft_data=magnitude_db.tolist(),
            sample_rate=self.sample_rate,
            center_frequency=self.center_frequency
        )
        
        # Broadcast to WebSocket clients
        await self._broadcast_fft_frame(fft_frame)
    
    async def _broadcast_fft_frame(self, fft_frame: FFTFrame):
        """Broadcast FFT frame to all connected WebSocket clients."""
        if not self.websocket_clients:
            return
        
        message = {
            "type": "fft_frame",
            "timestamp": fft_frame.timestamp.isoformat(),
            "fft_data": fft_frame.fft_data,
            "sample_rate": fft_frame.sample_rate,
            "center_frequency": fft_frame.center_frequency
        }
        
        # Send to all clients, remove disconnected ones
        disconnected_clients = set()
        
        for client in self.websocket_clients.copy():
            try:
                await client.send_json(message)
            except Exception as e:
                logger.warning(f"Failed to send to WebSocket client: {e}")
                disconnected_clients.add(client)
        
        # Remove disconnected clients
        for client in disconnected_clients:
            await self.remove_websocket_client(client)
    
    async def broadcast_notification(self, notification_type: str, data: dict):
        """Broadcast notification to all connected WebSocket clients."""
        if not self.websocket_clients:
            return
        
        message = {
            "type": notification_type,
            **data
        }
        
        # Send to all clients, remove disconnected ones
        disconnected_clients = set()
        
        for client in self.websocket_clients.copy():
            try:
                await client.send_json(message)
            except Exception as e:
                logger.warning(f"Failed to send notification to WebSocket client: {e}")
                disconnected_clients.add(client)
        
        # Remove disconnected clients
        for client in disconnected_clients:
            await self.remove_websocket_client(client)


# Global FFT service instance
fft_service = FFTService()