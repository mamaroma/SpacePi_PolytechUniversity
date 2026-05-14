from __future__ import annotations

import asyncio
import logging
import sys
from pathlib import Path

logger = logging.getLogger(__name__)

_PROJECT_ROOT = Path(__file__).parent.parent.resolve()
_SDR_ROOT = _PROJECT_ROOT / "sdr" / "sdr_web_test"
_SDR_FRONTEND = _SDR_ROOT / "frontend"

if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

_SDR_IMPORT_ERROR: str | None = None


def _try_import_sdr():
    global _SDR_IMPORT_ERROR
    try:
        from sdr.sdr_web_test.app.sdr.routes import router as sdr_router
        from sdr.sdr_web_test.app.sdr.websocket import websocket_endpoint
        _SDR_IMPORT_ERROR = None
        return sdr_router, websocket_endpoint
    except Exception as exc:
        _SDR_IMPORT_ERROR = f"{type(exc).__name__}: {exc}"
        logger.error("SDR import failed: %s", _SDR_IMPORT_ERROR, exc_info=True)
        return None, None


def attach_sdr(app) -> None:
    from fastapi import APIRouter
    from fastapi.responses import FileResponse, JSONResponse, HTMLResponse
    from fastapi.staticfiles import StaticFiles

    sdr_router, websocket_endpoint = _try_import_sdr()

    # ── diagnostic endpoint (always available) ──────────────────────────────
    @app.get("/sdr-status", include_in_schema=False)
    async def sdr_status():
        return JSONResponse({
            "sdr_available": sdr_router is not None,
            "import_error": _SDR_IMPORT_ERROR,
            "project_root": str(_PROJECT_ROOT),
            "frontend_dir": str(_SDR_FRONTEND),
            "frontend_exists": _SDR_FRONTEND.is_dir(),
            "sys_path_0": sys.path[0] if sys.path else None,
        })

    if sdr_router is None:
        # ── stub routes when SDR is unavailable ─────────────────────────────
        stub = APIRouter()

        @stub.get("/sdr")
        @stub.get("/sdr/")
        async def sdr_index_stub():
            return HTMLResponse(
                f"<h2>SDR unavailable</h2><pre>{_SDR_IMPORT_ERROR}</pre>",
                status_code=503,
            )

        @stub.get("/sdr/api/info")
        @stub.get("/sdr/api/signal/info")
        @stub.get("/sdr/api/passes")
        @stub.get("/sdr/api/record/state")
        async def sdr_api_stub():
            return JSONResponse(
                {"detail": f"SDR unavailable: {_SDR_IMPORT_ERROR}"},
                status_code=503,
            )

        app.include_router(stub)

        # WebSocket stub — closes with code 1011 (server error) immediately
        @app.websocket("/sdr/ws/sdr")
        async def sdr_ws_stub(websocket):
            await websocket.accept()
            await websocket.close(code=1011, reason="SDR unavailable")

        logger.warning("SDR mounted as STUB (503) — check /sdr-status for details")
        return

    # ── real SDR routes ──────────────────────────────────────────────────────
    app.include_router(sdr_router, prefix="/sdr")
    app.websocket("/sdr/ws/sdr")(websocket_endpoint)

    if _SDR_FRONTEND.is_dir():
        app.mount(
            "/sdr/static",
            StaticFiles(directory=str(_SDR_FRONTEND)),
            name="sdr_static",
        )
        logger.info("SDR static files mounted from %s", _SDR_FRONTEND)
    else:
        logger.warning("SDR frontend dir not found: %s", _SDR_FRONTEND)

    @app.get("/sdr", include_in_schema=False)
    async def sdr_index():
        return FileResponse(str(_SDR_FRONTEND / "index.html"))

    @app.get("/sdr/", include_in_schema=False)
    async def sdr_index_slash():
        return FileResponse(str(_SDR_FRONTEND / "index.html"))

    logger.info("SDR sub-service fully attached at /sdr")


async def sdr_startup() -> dict:
    import numpy as np  # noqa: F401

    try:
        from sdr.sdr_web_test.app.sdr.zmq_receiver import zmq_receiver
        from sdr.sdr_web_test.app.sdr.fft_service import fft_service
        from sdr.sdr_web_test.app.sdr.auto_recorder import auto_recorder
        from sdr.sdr_web_test.app.sdr.playback_service import playback_service
    except Exception as exc:
        logger.error("SDR startup skipped: %s", exc)
        return {}

    handles: dict = {}

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

    await auto_recorder.start_monitoring()
    logger.info("SDR: auto-recorder started")

    async def _playback_callback(samples, playback_params=None):
        return await fft_service.process_samples(samples, playback_params)

    playback_service.set_sample_callback(_playback_callback)

    handles["silence_task"] = asyncio.create_task(
        _inject_silence(fft_service, auto_recorder, playback_service)
    )
    handles["cleanup_task"] = asyncio.create_task(_periodic_cleanup(auto_recorder))

    return handles


async def sdr_shutdown(handles: dict) -> None:
    if not handles:
        return
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
        logger.error("SDR: no silence data")
        return

    silence_timeout = 0.5
    samples_per_chunk = 4096
    silence_offset = 0
    silence_active = False
    last_log = 0.0

    while True:
        try:
            now = asyncio.get_event_loop().time()
            if now - last_log > 5.0:
                logger.debug("SDR silence: active=%s", silence_active)
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
                        logger.info("SDR: silence stopped (real signal)")
                        silence_active = False
                    await asyncio.sleep(0.1)
            else:
                if silence_active:
                    silence_active = False
                silence_offset = 0
                await asyncio.sleep(0.5)

        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.error("SDR silence error: %s", exc)
            await asyncio.sleep(1.0)
