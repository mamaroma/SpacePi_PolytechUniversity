"""Main FastAPI application for SDR streaming."""
import asyncio
import logging
from datetime import datetime, timedelta
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from .sdr.routes import router as sdr_router
from .sdr.websocket import websocket_endpoint
from .sdr.zmq_receiver import zmq_receiver
from .sdr.fft_service import fft_service
from .sdr.auto_recorder import auto_recorder
from .sdr.playback_service import playback_service

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    logger.info("Starting SDR streaming application")
    
    # Start background tasks
    zmq_task = None
    
    try:
        # Set up ZMQ callback that handles both real signal and silence
        async def zmq_callback_with_silence(samples):
            # Process real samples from GNU Radio
            await fft_service.process_samples(samples)
            # Also send to auto-recorder (this updates last_data_time)
            await auto_recorder.process_samples(samples)
        
        logger.info("Connecting to ZMQ...")
        try:
            await zmq_receiver.connect()
            zmq_receiver.set_sample_callback(zmq_callback_with_silence)
            zmq_task = asyncio.create_task(zmq_receiver.start_receiving())
        except Exception as e:
            logger.error(f"Failed to start ZMQ receiver: {e}")
            logger.info("Continuing without ZMQ connection")
        
        # Start auto-recorder
        logger.info("Starting auto-recorder...")
        await auto_recorder.start_monitoring()
        
        # Set up playback service with proper callback
        async def playback_callback(samples, playback_params=None):
            return await fft_service.process_samples(samples, playback_params)
        
        playback_service.set_sample_callback(playback_callback)
        
        # Start silence injection directly into ZMQ callback
        silence_task = asyncio.create_task(inject_silence_into_zmq())
        
        # Start cleanup task for old recordings
        cleanup_task = asyncio.create_task(periodic_cleanup())
        
        yield
        
    finally:
        logger.info("Shutting down SDR streaming application")
        
        # Stop auto-recorder
        await auto_recorder.stop_monitoring()
        
        # Stop playback service
        await playback_service.stop_playback()
        
        # Stop ZMQ receiver
        if zmq_task:
            await zmq_receiver.stop_receiving()
            zmq_task.cancel()
            try:
                await zmq_task
            except asyncio.CancelledError:
                pass
            await zmq_receiver.disconnect()
        
        # Stop cleanup task
        if 'cleanup_task' in locals():
            cleanup_task.cancel()
            try:
                await cleanup_task
            except asyncio.CancelledError:
                pass
        
        # Stop silence task
        if 'silence_task' in locals():
            silence_task.cancel()
            try:
                await silence_task
            except asyncio.CancelledError:
                pass


async def periodic_cleanup():
    """Periodically clean up old recordings."""
    while True:
        try:
            await asyncio.sleep(3600)  # Run every hour
            await auto_recorder.cleanup_old_recordings(max_age_hours=48)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Error in periodic cleanup: {e}")


async def inject_silence_into_zmq():
    """Inject silence samples directly into ZMQ callback when no real signal."""
    silence_timeout = 0.5  # Reduced timeout - start silence after 0.5 seconds
    
    # Load silence data
    silence_data = playback_service.silence_data
    if silence_data is None or len(silence_data) == 0:
        logger.error("CRITICAL: No silence data for injection - silence will not work!")
        return
    
    silence_offset = 0
    samples_per_chunk = 4096
    silence_active = False
    last_debug_time = 0
    
    logger.info(f"Silence injection ready: {len(silence_data)} samples")
    
    while True:
        try:
            current_time = asyncio.get_event_loop().time()
            
            # Debug info every 5 seconds
            if current_time - last_debug_time > 5.0:
                time_since_data = current_time - auto_recorder.last_data_time if auto_recorder.last_data_time > 0 else float('inf')
                logger.info(f"Silence status: recording={auto_recorder.is_recording}, "
                           f"playback={playback_service.is_playing}, "
                           f"last_data_time={auto_recorder.last_data_time}, "
                           f"time_since_data={time_since_data}, "
                           f"silence_active={silence_active}")
                last_debug_time = current_time
            
            # Check if we should inject silence
            if not auto_recorder.is_recording and not playback_service.is_playing:
                
                # If no real signal for timeout OR never received signal, inject silence
                should_inject_silence = (
                    auto_recorder.last_data_time == 0 or  # Never received signal
                    (auto_recorder.last_data_time > 0 and current_time - auto_recorder.last_data_time > silence_timeout)  # No signal for timeout
                )
                
                if should_inject_silence:
                    # Log when silence starts (once)
                    if not silence_active:
                        if auto_recorder.last_data_time == 0:
                            logger.info("Starting silence injection - no signal received yet")
                        else:
                            logger.info(f"Starting silence injection - no signal for {current_time - auto_recorder.last_data_time:.1f}s")
                        silence_active = True
                    
                    # Get silence chunk
                    if silence_offset + samples_per_chunk <= len(silence_data):
                        samples = silence_data[silence_offset:silence_offset + samples_per_chunk]
                    else:
                        first_part = silence_data[silence_offset:]
                        remaining = samples_per_chunk - len(first_part)
                        second_part = silence_data[:remaining]
                        samples = np.concatenate([first_part, second_part])
                        silence_offset = remaining
                    
                    silence_offset = (silence_offset + samples_per_chunk) % len(silence_data)
                    
                    # Inject directly into FFT service
                    playback_params = {
                        "center_frequency": playback_service.last_pass_center_frequency,
                        "sample_rate": 625000
                    }
                    await fft_service.process_samples(samples, playback_params)
                    
                    # Sleep for transmission time
                    transmission_time = samples_per_chunk / 625000
                    await asyncio.sleep(transmission_time)
                else:
                    # Real signal is present, stop silence
                    if silence_active:
                        logger.info("Stopping silence injection")
                        silence_active = False
                    await asyncio.sleep(0.1)
            else:
                # Recording or playback active, stop silence
                if silence_active:
                    logger.info("Stopping silence injection - recording/playback active")
                    silence_active = False
                silence_offset = 0
                await asyncio.sleep(0.5)
                    
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Error in silence injection: {e}")
            await asyncio.sleep(1.0)


async def silence_playback_loop():
    """Play silence when in live mode and no real signal is coming."""
    silence_timeout = 2.0  # Start silence after 2 seconds of no signal
    
    # Load silence data once
    silence_data = playback_service.silence_data
    if silence_data is None or len(silence_data) == 0:
        logger.warning("No silence data available for playback")
        return
    
    silence_offset = 0
    # Use same chunk size as GNU Radio typically sends
    samples_per_chunk = 4096
    
    logger.info(f"Silence playback: {len(silence_data)} samples loaded, chunk size: {samples_per_chunk}")
    
    while True:
        try:
            # Check if we should play silence
            if (not auto_recorder.is_recording and 
                not playback_service.is_playing and 
                auto_recorder.last_data_time > 0):
                
                current_time = asyncio.get_event_loop().time()
                
                # If no signal for timeout period, play silence continuously
                if current_time - auto_recorder.last_data_time > silence_timeout:
                    # Get next chunk of silence samples
                    if silence_offset + samples_per_chunk <= len(silence_data):
                        samples = silence_data[silence_offset:silence_offset + samples_per_chunk]
                    else:
                        # Wrap around
                        first_part = silence_data[silence_offset:]
                        remaining = samples_per_chunk - len(first_part)
                        second_part = silence_data[:remaining]
                        samples = np.concatenate([first_part, second_part])
                        silence_offset = remaining
                    
                    # Update offset for next iteration
                    silence_offset = (silence_offset + samples_per_chunk) % len(silence_data)
                    
                    # Send samples with correct parameters - NO SLEEP!
                    playback_params = {
                        "center_frequency": playback_service.last_pass_center_frequency,
                        "sample_rate": 625000
                    }
                    
                    await fft_service.process_samples(samples, playback_params)
                    
                    # Tiny yield to prevent blocking, but no real delay
                    await asyncio.sleep(0)
                else:
                    # Not time for silence yet
                    await asyncio.sleep(0.1)
            else:
                # Recording or playback active, reset silence offset
                silence_offset = 0
                await asyncio.sleep(0.5)
                    
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Error in silence playback loop: {e}")
            await asyncio.sleep(1.0)


# Create FastAPI app
app = FastAPI(
    title="SDR Трансляция",
    description="Потоковая обработка и визуализация SDR сигналов в реальном времени",
    version="1.0.0",
    lifespan=lifespan
)

# Include API routes
app.include_router(sdr_router)

# WebSocket endpoint
app.websocket("/ws/sdr")(websocket_endpoint)

# Serve static files
app.mount("/static", StaticFiles(directory="frontend"), name="static")

# Serve index.html at root
@app.get("/")
async def read_index():
    return FileResponse("frontend/index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )