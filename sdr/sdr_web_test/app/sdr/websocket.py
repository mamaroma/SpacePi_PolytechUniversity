"""WebSocket handler for real-time FFT streaming."""
import logging
import hmac
import json
import uuid
import numpy as np
from fastapi import WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field, ValidationError
from .fft_service import fft_service
from .state import sdr_state
from .config import SDR_INGEST_TOKEN, IQ_MAX_FRAME_BYTES

logger = logging.getLogger(__name__)


class StationHello(BaseModel):
    type: str = "station_hello"
    station_id: str = Field(default="Наземная станция", min_length=1, max_length=64)
    sample_rate: int | None = Field(default=None, ge=1, le=20_000_000)
    center_frequency: int | None = Field(default=None, ge=1, le=10_000_000_000)
    satellite_name: str | None = Field(default=None, max_length=120)


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
    """Receive raw complex64 frames; an optional JSON hello adds station metadata."""
    supplied_token = websocket.headers.get("x-sdr-token") or websocket.query_params.get("token", "")
    if SDR_INGEST_TOKEN and not hmac.compare_digest(supplied_token, SDR_INGEST_TOKEN):
        await websocket.close(code=1008, reason="Invalid station token")
        return

    connection_id = uuid.uuid4().hex
    if not await sdr_state.claim_station(connection_id):
        await websocket.close(code=1008, reason="Another station is connected")
        return

    frames_received = 0
    samples_received = 0
    try:
        await websocket.accept()
        logger.info("IQ ingest client connected")
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
                        **(await sdr_state.get_stream_status()),
                    })
                else:
                    try:
                        if text is None or len(text) > 2048:
                            raise ValueError("Metadata message is too large")
                        payload = json.loads(text)
                        if not isinstance(payload, dict) or payload.get("type") != "station_hello":
                            raise ValueError("Unknown station message")
                        hello = StationHello.model_validate(payload)
                        await sdr_state.set_station_metadata(connection_id, hello.model_dump())
                        fft_service.mark_parameters_dirty()
                        await websocket.send_json({"type": "station_ack", "station_id": hello.station_id})
                    except (ValueError, ValidationError) as exc:
                        await websocket.send_json({"type": "error", "detail": str(exc)})
                continue

            if len(data) > IQ_MAX_FRAME_BYTES:
                await websocket.close(code=1009, reason="IQ frame exceeds size limit")
                break
            if not data:
                continue
            if len(data) % np.dtype(np.complex64).itemsize:
                await websocket.send_json({"type": "error", "detail": "IQ frame must contain complete complex64 samples"})
                continue

            samples = np.frombuffer(data, dtype=np.complex64)
            if len(samples) == 0:
                continue

            await sdr_state.note_iq_frame(connection_id, len(samples))
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
    finally:
        await sdr_state.release_station(connection_id)
        fft_service.mark_parameters_dirty()
