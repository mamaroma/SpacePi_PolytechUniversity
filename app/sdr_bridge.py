"""SDR service bridge — mounts SDR sub-app into the main FastAPI application."""
from __future__ import annotations

import asyncio
import logging
import sys
from pathlib import Path

logger = logging.getLogger(__name__)

# Absolute path to the project root (parent of app/)
_PROJECT_ROOT = Path(__file__).parent.parent.resolve()
_SDR_ROOT = _PROJECT_ROOT / "sdr" / "sdr_web_test"
_SDR_FRONTEND = _SDR_ROOT / "frontend"

# Ensure the project root is on sys.path so `sdr.*` imports resolve
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))


def attach_sdr(app) -> None:
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse

    try:
        from sdr.sdr_web_test.app.sdr.routes import router as sdr_router
        from sdr.sdr_web_test.app.sdr.websocket import websocket_endpoint
    except Exception as exc:
        logger.error("Could not import SDR modules: %s", exc, exc_info=True)

        # Mount a stub so /sdr/api/info returns 503 instead of 404
        from fastapi import APIRouter
        from fastapi.responses import JSONResponse
        stub = APIRouter(prefix="/sdr/api")

        @stub.get("/info")
        @stub.get("/{path:path}")
        async def _sdr_unavailable(path: str = ""):
            return JSONResponse(
                {"detail": f"SDR unavailable: {exc}"},
                status_code=503,
            )

        app.include_router(stub)
        return

    # API routes — original prefix is /api, we include them under /sdr so
    # the effective path becomes /sdr/api/…
    app.include_router(sdr_router, prefix="/sdr")

    # WebSocket — frontend connects to /sdr/ws/sdr
    app.websocket("/sdr/ws/sdr")(websocket_endpoint)

    # Static assets — frontend references /sdr/static/…
    if _SDR_FRONTEND.is_dir():
        app.mount(
            "/sdr/static",
            StaticFiles(directory=str(_SDR_FRONTEND)),
            name="sdr_static",
        )
    else:
        logger.warning("SDR frontend directory not found: %s", _SDR_FRONTEND)

    # SDR index.html served at /sdr
    @app.get("/sdr", include_in_schema=False)
    @app.get("/sdr/", include_in_schema=False)
    async def sdr_index():
        index = _SDR_FRONTEND / "index.html"
        return FileResponse(str(index))

    logger.info("SDR sub-service attached at /sdr")


async def sdr_startup() -> dict:
    """
    Start all SDR background tasks.  Returns a dict of task handles that must
    be passed to :func:`sdr_shutdown` on application shutdown.
    """
    import numpy as np  # noqa: F401 — validates numpy is available

    try:
        from sdr.sdr_web_test.app.sdr.zmq_receiver import zmq_receiver
        from sdr.sdr_web_test.app.sdr.fft_service import fft_service
        from sdr.sdr_web_test.app.sdr.auto_recorder import auto_recorder
        from sdr.sdr_web_test.app.sdr.playback_service import playback_service
    except Exception as exc:
        logger.error("SDR startup aborted — cannot import SDR modules: %s", exc)
        return {}

    handles: dict = {}

    # ZMQ → FFT + auto-recorder callback
    async def _zmq_callback(samples):
        await fft_service.process_samples(samples)
        await auto_recorder.process_samples(samples)

    try:
        await zmq_receiver.connect()
        zmq_receiver.set_sample_callback(_zmq_callback)
        handles["zmq_task"] = asyncio.create_task(zmq_receiver.start_receiving())
        logger.info("SDR: ZMQ receiver started")
    except Exception as exc:
        logger.warning("SDR: ZMQ unavailable (%s) — silence mode only", exc)

    # Auto-recorder monitoring
    await auto_recorder.start_monitoring()
    logger.info("SDR: auto-recorder started")

    # Playback callback
    async def _playback_callback(samples, playback_params=None):
        return await fft_service.process_samples(samples, playback_params)

    playback_service.set_sample_callback(_playback_callback)

    # Silence injection task
    handles["silence_task"] = asyncio.create_task(
        _inject_silence(fft_service, auto_recorder, playback_service)
    )

    # Periodic cleanup task (removes recordings older than 48 h)
    handles["cleanup_task"] = asyncio.create_task(_periodic_cleanup(auto_recorder))

    return handles


async def sdr_shutdown(handles: dict) -> None:
    """Stop all SDR background tasks gracefully."""
    try:
        from sdr.sdr_web_test.app.sdr.zmq_receiver import zmq_receiver
        from sdr.sdr_web_test.app.sdr.auto_recorder import auto_recorder
        from sdr.sdr_web_test.app.sdr.playback_service import playback_service
    except Exception:
        return

    await auto_recorder.stop_monitoring()
    await playback_service.stop_playback()

    zmq_task = handles.get("zmq_task")
    if zmq_task:
        await zmq_receiver.stop_receiving()
        zmq_task.cancel()
        try:
            await zmq_task
        except asyncio.CancelledError:
            pass
        await zmq_receiver.disconnect()

    for key in ("silence_task", "cleanup_task"):
        task = handles.get(key)
        if task:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    logger.info("SDR sub-service stopped")


# ---------------------------------------------------------------------------
# Internal background coroutines
# ---------------------------------------------------------------------------

async def _periodic_cleanup(auto_recorder) -> None:
    while True:
        try:
            await asyncio.sleep(3600)
            await auto_recorder.cleanup_old_recordings(max_age_hours=48)
        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.error("SDR cleanup error: %s", exc)


async def _inject_silence(fft_service, auto_recorder, playback_service) -> None:
    import numpy as np

    silence_data = playback_service.silence_data
    if silence_data is None or len(silence_data) == 0:
        logger.error("SDR: no silence data — silence injection disabled")
        return

    silence_timeout = 0.5
    samples_per_chunk = 4096
    silence_offset = 0
    silence_active = False
    last_log = 0.0

    logger.info("SDR: silence injection ready (%d samples)", len(silence_data))

    while True:
        try:
            now = asyncio.get_event_loop().time()

            if now - last_log > 5.0:
                dt = now - auto_recorder.last_data_time if auto_recorder.last_data_time > 0 else float("inf")
                logger.debug(
                    "SDR silence: recording=%s playback=%s dt=%.1f active=%s",
                    auto_recorder.is_recording,
                    playback_service.is_playing,
                    dt,
                    silence_active,
                )
                last_log = now

            if not auto_recorder.is_recording and not playback_service.is_playing:
                should = (
                    auto_recorder.last_data_time == 0
                    or (now - auto_recorder.last_data_time > silence_timeout)
                )
                if should:
                    if not silence_active:
                        logger.info("SDR: silence injection started")
                        silence_active = True

                    end = silence_offset + samples_per_chunk
                    if end <= len(silence_data):
                        chunk = silence_data[silence_offset:end]
                    else:
                        first = silence_data[silence_offset:]
                        rem = samples_per_chunk - len(first)
                        chunk = np.concatenate([first, silence_data[:rem]])
                        silence_offset = rem
                    silence_offset = (silence_offset + samples_per_chunk) % len(silence_data)

                    await fft_service.process_samples(
                        chunk,
                        {
                            "center_frequency": playback_service.last_pass_center_frequency,
                            "sample_rate": 625000,
                        },
                    )
                    await asyncio.sleep(samples_per_chunk / 625000)
                else:
                    if silence_active:
                        logger.info("SDR: silence injection stopped (real signal)")
                        silence_active = False
                    await asyncio.sleep(0.1)
            else:
                if silence_active:
                    logger.info("SDR: silence injection paused (recording/playback)")
                    silence_active = False
                silence_offset = 0
                await asyncio.sleep(0.5)

        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.error("SDR silence injection error: %s", exc)
            await asyncio.sleep(1.0)
