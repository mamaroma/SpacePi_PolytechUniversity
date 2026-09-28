"""Standalone SDR app with the same paths and recording policy as the service."""
import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from .sdr.config import SDR_ENABLE_ZMQ
from .sdr.fft_service import fft_service
from .sdr.auto_recorder import auto_recorder
from .sdr.playback_service import playback_service
from .sdr.recorder import iq_recorder
from .sdr.routes import router as sdr_router
from .sdr.state import sdr_state
from .sdr.websocket import iq_ingest_endpoint, websocket_endpoint
from .sdr.zmq_receiver import zmq_receiver

logger = logging.getLogger(__name__)
FRONTEND = Path(__file__).resolve().parent.parent / "frontend"


async def inject_background_spectrum():
    chunk_size = 4096
    while True:
        try:
            if (await sdr_state.get_stream_status())["streaming"]:
                await asyncio.sleep(0.1)
                continue
            chunk = playback_service.get_background_samples(chunk_size)
            await fft_service.process_samples(chunk, {
                "center_frequency": playback_service.last_pass_center_frequency,
                "sample_rate": playback_service.sample_rate,
            })
            await asyncio.sleep(chunk_size / playback_service.sample_rate)
        except asyncio.CancelledError:
            break
        except Exception:
            logger.exception("SDR background spectrum failed")
            await asyncio.sleep(1)


async def sweep_recordings():
    while True:
        try:
            await asyncio.sleep(60)
            await iq_recorder.sweep()
            await auto_recorder.cleanup_old_recordings(max_age_hours=48)
        except asyncio.CancelledError:
            break


@asynccontextmanager
async def lifespan(app: FastAPI):
    iq_recorder.cleanup_orphans()
    await auto_recorder.cleanup_old_recordings(max_age_hours=48)
    await auto_recorder.start_monitoring()
    tasks = [asyncio.create_task(inject_background_spectrum()), asyncio.create_task(sweep_recordings())]
    if SDR_ENABLE_ZMQ:
        try:
            await zmq_receiver.connect()

            async def on_iq(samples):
                if sdr_state.station_connection_id is None:
                    await sdr_state.note_local_iq_frame(len(samples))
                    await fft_service.process_samples(samples)

            zmq_receiver.set_sample_callback(on_iq)
            tasks.append(asyncio.create_task(zmq_receiver.start_receiving()))
        except Exception:
            logger.exception("SDR local ZMQ receiver unavailable")
    try:
        yield
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await zmq_receiver.stop_receiving()
        await zmq_receiver.disconnect()
        await auto_recorder.stop_monitoring()
        await iq_recorder.shutdown()


app = FastAPI(title="PolySpace SDR", lifespan=lifespan)
app.include_router(sdr_router, prefix="/sdr")
app.websocket("/sdr/ws/sdr")(websocket_endpoint)
app.websocket("/sdr/ws/iq-ingest")(iq_ingest_endpoint)
app.mount("/sdr/static", StaticFiles(directory=str(FRONTEND)), name="sdr_static")


@app.get("/sdr")
@app.get("/sdr/")
async def sdr_page():
    return FileResponse(FRONTEND / "index.html")


@app.get("/")
async def root():
    return RedirectResponse("/sdr")
