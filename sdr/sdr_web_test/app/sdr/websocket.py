"""WebSocket handler for real-time FFT streaming."""
import logging
import numpy as np
from fastapi import WebSocket, WebSocketDisconnect
from .fft_service import fft_service

logger = logging.getLogger(__name__)


async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for FFT streaming."""
    await websocket.accept()
    logger.info("WebSocket client connected")
    
    try:
        # Add client to FFT service
        await fft_service.add_websocket_client(websocket)
        
        # Keep connection alive and handle client messages
        while True:
            try:
                # Wait for client messages (ping/pong, etc.)
                message = await websocket.receive_text()
                
                # Handle client commands
                if message == "ping":
                    await websocket.send_text("pong")
                elif message == "get_status":
                    await websocket.send_json({
                        "type": "status",
                        "clients_connected": len(fft_service.websocket_clients)
                    })
                    
            except WebSocketDisconnect:
                break
            except Exception as e:
                logger.error(f"WebSocket error: {e}")
                break
                
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as e:
        logger.error(f"WebSocket connection error: {e}")
    finally:
        # Remove client from FFT service
        await fft_service.remove_websocket_client(websocket)


async def iq_ingest_endpoint(websocket: WebSocket):
    """WebSocket endpoint for receiving live IQ samples from remote stations."""
    await websocket.accept()
    logger.info("IQ ingest client connected")

    frames_received = 0
    samples_received = 0

    try:
        while True:
            message = await websocket.receive()
            message_type = message.get("type")

            if message_type == "websocket.disconnect":
                break

            data = message.get("bytes")
            if data is None:
                text = message.get("text")
                if text == "ping":
                    await websocket.send_text("pong")
                elif text == "get_status":
                    await websocket.send_json({
                        "type": "iq_ingest_status",
                        "frames_received": frames_received,
                        "samples_received": samples_received,
                    })
                else:
                    await websocket.send_json({
                        "type": "error",
                        "detail": "Send binary complex64 IQ frames, or text 'ping'/'get_status'.",
                    })
                continue

            if len(data) < np.dtype(np.complex64).itemsize:
                continue

            aligned_size = len(data) - (len(data) % np.dtype(np.complex64).itemsize)
            if aligned_size != len(data):
                logger.warning("IQ ingest frame has %s trailing unaligned bytes", len(data) - aligned_size)
                data = data[:aligned_size]

            samples = np.frombuffer(data, dtype=np.complex64)
            if len(samples) == 0:
                continue

            await fft_service.process_samples(samples)
            frames_received += 1
            samples_received += len(samples)

            if frames_received % 1000 == 0:
                logger.info(
                    "IQ ingest received %s frames, %s samples",
                    frames_received,
                    samples_received,
                )

    except WebSocketDisconnect:
        logger.info("IQ ingest client disconnected")
    except Exception as e:
        logger.error(f"IQ ingest WebSocket error: {e}")
        try:
            await websocket.close(code=1011, reason="IQ ingest error")
        except Exception:
            pass
