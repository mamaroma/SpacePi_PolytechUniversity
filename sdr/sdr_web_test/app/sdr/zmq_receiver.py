"""ZeroMQ IQ sample receiver."""
import asyncio
import logging
import zmq
import zmq.asyncio
import numpy as np
from typing import Callable, Optional
from .config import ZMQ_ADDRESS, ZMQ_TIMEOUT, DEFAULT_FFT_SIZE
from .state import sdr_state

logger = logging.getLogger(__name__)


class ZMQReceiver:
    """Receives IQ samples from GNU Radio via ZeroMQ."""
    
    def __init__(self):
        self.context: Optional[zmq.asyncio.Context] = None
        self.socket: Optional[zmq.asyncio.Socket] = None
        self.running = False
        self.sample_callback: Optional[Callable[[np.ndarray], None]] = None
    
    async def connect(self):
        """Connect to ZeroMQ publisher."""
        try:
            self.context = zmq.asyncio.Context()
            self.socket = self.context.socket(zmq.SUB)
            self.socket.setsockopt(zmq.SUBSCRIBE, b"")  # Subscribe to all messages
            self.socket.setsockopt(zmq.RCVTIMEO, ZMQ_TIMEOUT)
            self.socket.connect(ZMQ_ADDRESS)
            
            await sdr_state.set_zmq_connected(True)
            logger.info(f"Connected to ZMQ at {ZMQ_ADDRESS}")
            
        except Exception as e:
            logger.error(f"Failed to connect to ZMQ: {e}")
            await sdr_state.set_zmq_connected(False)
            raise
    
    async def disconnect(self):
        """Disconnect from ZeroMQ."""
        self.running = False
        
        if self.socket:
            self.socket.close()
            self.socket = None
        
        if self.context:
            self.context.term()
            self.context = None
        
        await sdr_state.set_zmq_connected(False)
        logger.info("Disconnected from ZMQ")
    
    def set_sample_callback(self, callback: Callable[[np.ndarray], None]):
        """Set callback function for received samples."""
        self.sample_callback = callback
    
    async def start_receiving(self):
        """Start receiving IQ samples."""
        if not self.socket:
            raise RuntimeError("Not connected to ZMQ")
        
        self.running = True
        logger.info("Started receiving IQ samples")
        
        try:
            while self.running:
                try:
                    # Receive IQ samples
                    data = await self.socket.recv()
                    
                    # Convert bytes to complex64 numpy array
                    samples = np.frombuffer(data, dtype=np.complex64)
                    
                    if len(samples) > 0 and self.sample_callback:
                        await self.sample_callback(samples)
                        
                except zmq.Again:
                    # Timeout, continue loop
                    continue
                except Exception as e:
                    logger.error(f"Error receiving samples: {e}")
                    await asyncio.sleep(0.1)
                    
        except asyncio.CancelledError:
            logger.info("ZMQ receiver cancelled")
        except Exception as e:
            logger.error(f"ZMQ receiver error: {e}")
        finally:
            await sdr_state.set_zmq_connected(False)
    
    async def stop_receiving(self):
        """Stop receiving IQ samples."""
        self.running = False
        logger.info("Stopping ZMQ receiver")


# Global receiver instance
zmq_receiver = ZMQReceiver()