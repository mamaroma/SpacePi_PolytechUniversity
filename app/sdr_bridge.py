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
        from sdr.sdr_web_test.app.sdr.websocket import iq_ingest_endpoint, websocket_endpoint
        _SDR_IMPORT_ERROR = None
        return sdr_router, websocket_endpoint, iq_ingest_endpoint
    except Exception as exc:
        _SDR_IMPORT_ERROR = f"{type(exc).__name__}: {exc}"
        logger.error("SDR import failed: %s", _SDR_IMPORT_ERROR, exc_info=True)
        return None, None, None


def attach_sdr(app) -> None:
    from fastapi import APIRouter
    from fastapi.responses import FileResponse, JSONResponse, HTMLResponse
    from fastapi.staticfiles import StaticFiles

    sdr_router, websocket_endpoint, iq_ingest_endpoint = _try_import_sdr()

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

        from fastapi import WebSocket as _WebSocket
        from starlette.routing import WebSocketRoute as _WSRoute

        async def _ws_stub(websocket: _WebSocket):
            await websocket.accept()
            await websocket.close(code=1011, reason="SDR unavailable")

        app.include_router(stub)
        app.router.routes.append(_WSRoute("/sdr/ws/sdr", _ws_stub))
        app.router.routes.append(_WSRoute("/sdr/ws/iq-ingest", _ws_stub))

        logger.warning("SDR mounted as STUB (503) — check /sdr-status for details")
        return

    # ── real SDR routes ──────────────────────────────────────────────────────
    from starlette.routing import WebSocketRoute as _WSRoute
    app.include_router(sdr_router, prefix="/sdr")
    app.router.routes.append(_WSRoute("/sdr/ws/sdr", websocket_endpoint))
    app.router.routes.append(_WSRoute("/sdr/ws/iq-ingest", iq_ingest_endpoint))
    logger.info("SDR WebSocket registered at /sdr/ws/sdr")
    logger.info("SDR IQ ingest WebSocket registered at /sdr/ws/iq-ingest")

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
        from sdr.sdr_web_test.app.sdr.config import SDR_ENABLE_ZMQ, SDR_INGEST_TOKEN
        from sdr.sdr_web_test.app.sdr.fft_service import fft_service
        from sdr.sdr_web_test.app.sdr.recorder import iq_recorder
        from sdr.sdr_web_test.app.sdr.auto_recorder import auto_recorder
        from sdr.sdr_web_test.app.sdr.playback_service import playback_service
        from sdr.sdr_web_test.app.sdr.state import sdr_state
    except Exception as exc:
        logger.error("SDR startup skipped: %s", exc)
        return {}

    handles: dict = {}
    iq_recorder.cleanup_orphans()
    await auto_recorder.cleanup_old_recordings(max_age_hours=48)
    await auto_recorder.start_monitoring()

    async def _zmq_callback(samples):
        from sdr.sdr_web_test.app.sdr.state import sdr_state
        if sdr_state.station_connection_id is not None:
            return
        await sdr_state.note_local_iq_frame(len(samples))
        await fft_service.process_samples(samples)

    if SDR_ENABLE_ZMQ:
        try:
            await zmq_receiver.connect()
            zmq_receiver.set_sample_callback(_zmq_callback)
            handles["zmq_task"] = asyncio.create_task(zmq_receiver.start_receiving())
            logger.info("SDR: legacy local ZMQ receiver started")
        except Exception as exc:
            logger.warning("SDR: ZMQ unavailable (%s)", exc)

    if not SDR_INGEST_TOKEN:
        logger.warning("SDR_INGEST_TOKEN is unset; IQ ingest accepts unauthenticated station connections")

    handles["silence_task"] = asyncio.create_task(
        _inject_silence(fft_service, sdr_state, playback_service)
    )
    handles["cleanup_task"] = asyncio.create_task(_periodic_cleanup(iq_recorder, auto_recorder))

    return handles


async def sdr_shutdown(handles: dict) -> None:
    if not handles:
        return
    try:
        from sdr.sdr_web_test.app.sdr.zmq_receiver import zmq_receiver
        from sdr.sdr_web_test.app.sdr.recorder import iq_recorder
        from sdr.sdr_web_test.app.sdr.auto_recorder import auto_recorder
    except Exception:
        return

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

    await auto_recorder.stop_monitoring()
    await iq_recorder.shutdown()

    logger.info("SDR sub-service stopped")


async def _periodic_cleanup(iq_recorder, auto_recorder) -> None:
    while True:
        try:
            await asyncio.sleep(60)
            await iq_recorder.sweep()
            await auto_recorder.cleanup_old_recordings(max_age_hours=48)
        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.error("SDR cleanup error: %s", exc)


async def _inject_silence(fft_service, sdr_state, playback_service) -> None:
    """Фоновый спектр для водопада, когда нет живого IQ.

    Важно: не дёргать event loop чаще, чем FPS водопада. Раньше sleep был
    ``chunk/sample_rate`` (~6.5 мс → ~150 Гц), и на одном uvicorn-воркере
    зависали все `/api/*` (новости, телеметрия, орбиты).
    """
    samples_per_chunk = 4096
    silence_active = False

    while True:
        try:
            if not (await sdr_state.get_stream_status())["streaming"]:
                clients = len(getattr(fft_service, "websocket_clients", None) or ())
                # Пока SDR никто не смотрит — не жжём CPU/event loop.
                if clients == 0:
                    if silence_active:
                        logger.info("SDR: background spectrum paused (no clients)")
                        silence_active = False
                    await asyncio.sleep(0.5)
                    continue

                if not silence_active:
                    logger.info("SDR: background spectrum started (%s client(s))", clients)
                    silence_active = True

                chunk = playback_service.get_background_samples(samples_per_chunk)

                await fft_service.process_samples(
                    chunk,
                    {
                        "center_frequency": playback_service.last_pass_center_frequency,
                        "sample_rate": playback_service.sample_rate,
                    },
                )
                fps = int(getattr(fft_service, "fps", 15) or 15)
                fps = max(5, min(fps, 20))
                await asyncio.sleep(1.0 / fps)
            else:
                if silence_active:
                    logger.info("SDR: background spectrum stopped (real signal)")
                    silence_active = False
                await asyncio.sleep(0.1)

        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.error("SDR silence error: %s", exc)
            await asyncio.sleep(1.0)
