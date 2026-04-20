"""WebSocket handler for real-time FFT streaming."""
import logging
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