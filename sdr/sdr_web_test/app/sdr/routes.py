"""FastAPI routes for SDR streaming application."""
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict
from fastapi import APIRouter, HTTPException, status
from .models import SignalInfo, PassList, SatellitePass, SystemInfo, SpectrumParams, SatelliteData
from .state import sdr_state
from .recorder import iq_recorder
from .auto_recorder import auto_recorder
from .satellite_service import satellite_service
from .fft_service import fft_service
from .config import DEFAULT_FFT_SIZE, DEFAULT_FFT_UPDATE_RATE, DEFAULT_SAMPLE_RATE

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["sdr"])


@router.get("/info", response_model=SystemInfo)
async def get_system_info():
    """Get system information and status."""
    return await sdr_state.get_system_info()


@router.get("/stream/status")
async def get_stream_status():
    """Describe received IQ frames separately from the demonstration spectrum."""
    return await sdr_state.get_stream_status()


@router.get("/time")
async def get_server_time():
    """Get authoritative server time for timeline live mode."""
    now_utc = datetime.now(timezone.utc)
    return {
        "server_time_utc": now_utc.isoformat().replace("+00:00", "Z"),
        "server_timestamp_ms": int(now_utc.timestamp() * 1000),
        "timezone": "UTC",
    }


@router.get("/satellites", response_model=Dict[str, SatelliteData])
async def get_all_satellites():
    """Get all available satellite data."""
    return satellite_service.get_all_satellites()


@router.get("/satellites/{satellite_name}", response_model=SatelliteData)
async def get_satellite(satellite_name: str):
    """Get specific satellite data."""
    satellite = satellite_service.get_satellite(satellite_name)
    if not satellite:
        raise HTTPException(status_code=404, detail=f"Satellite {satellite_name} not found")
    return satellite


@router.post("/spectrum/params", status_code=status.HTTP_201_CREATED)
async def update_spectrum_params(params: SpectrumParams):
    """Optionally override spectrum parameters for FFT display."""
    try:
        await sdr_state.update_spectrum_params(params)
        
        # Update last pass frequency for silence playback
        fft_service.update_last_pass_frequency(params.center_frequency)
        
        logger.info(f"Updated spectrum override: center={params.center_frequency/1e6:.3f} MHz")
        return {"message": "Spectrum parameters updated successfully"}
    except Exception as e:
        logger.error(f"Failed to update spectrum params: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/signal/info", response_model=SignalInfo)
async def get_signal_info():
    """Get current signal info (combines next satellite data + spectrum params)."""
    try:
        pass_info = satellite_service.get_active_or_next_pass()
        if not pass_info:
            raise HTTPException(status_code=404, detail="No upcoming satellite passes")
        
        # Get satellite data
        satellite_data = satellite_service.get_satellite(pass_info.satellite_name)
        if not satellite_data:
            raise HTTPException(status_code=404, detail=f"Satellite data not found for {pass_info.satellite_name}")
        
        spectrum_override = await sdr_state.get_spectrum_params()
        center_frequency = (
            spectrum_override.center_frequency
            if spectrum_override
            else satellite_service.get_center_frequency_for_pass(pass_info)
        )
        
        # Combine into SignalInfo
        signal_info = SignalInfo(
            # Spectrum parameters
            center_frequency=center_frequency,
            sample_rate=DEFAULT_SAMPLE_RATE,
            fft_size=DEFAULT_FFT_SIZE,
            fps=DEFAULT_FFT_UPDATE_RATE,
            # Satellite parameters
            satellite_name=satellite_data.name,
            frequency=satellite_data.frequency,
            bandwidth=satellite_data.bandwidth,
            spreading_factor=satellite_data.spreading_factor,
            coding_rate=satellite_data.coding_rate,
            sync_word=satellite_data.sync_word,
            preamble_length=satellite_data.preamble_length,
            crc_enabled=satellite_data.crc_enabled
        )
        
        return signal_info
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get signal info: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/passes", status_code=status.HTTP_201_CREATED)
async def update_satellite_passes(pass_list: PassList):
    """Update satellite pass information."""
    try:
        await sdr_state.update_satellite_passes(pass_list.passes)
        # Also update satellite service cache
        satellite_service.set_passes(pass_list.passes)
        pass_info = satellite_service.get_active_or_next_pass()
        if pass_info:
            center_frequency = satellite_service.get_center_frequency_for_pass(pass_info)
            fft_service.update_last_pass_frequency(center_frequency)
        logger.info(f"Updated {len(pass_list.passes)} satellite passes")
        return {"message": f"Updated {len(pass_list.passes)} satellite passes"}
    except Exception as e:
        logger.error(f"Failed to update satellite passes: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/passes", response_model=List[SatellitePass])
async def get_satellite_passes():
    """Get current satellite pass information."""
    return satellite_service.get_passes()


@router.get("/passes/next", response_model=SatellitePass)
async def get_next_pass():
    """Get the next upcoming satellite pass."""
    next_pass = satellite_service.get_active_or_next_pass()
    if not next_pass:
        raise HTTPException(status_code=404, detail="No upcoming satellite passes")
    return next_pass


@router.get("/recordings")
async def list_pass_recordings():
    """Completed station IQ captures, available for 48 hours after a pass."""
    return {"recordings": auto_recorder.get_recordings_timeline(hours_back=48)}


@router.get("/recordings/{filename}")
async def download_pass_recording(filename: str):
    """Download a completed pass recording while it is within retention."""
    if filename != Path(filename).name or not filename.endswith("_auto.iq"):
        raise HTTPException(status_code=404, detail="Запись пролёта не найдена")
    available = auto_recorder.get_recordings_timeline(hours_back=48)
    if not any(recording["filename"] == filename for recording in available):
        raise HTTPException(status_code=404, detail="Запись пролёта не найдена")
    path = auto_recorder.recordings_dir / filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Запись пролёта не найдена")
    return FileResponse(
        path=path,
        filename=filename,
        media_type="application/octet-stream",
        headers={"Cache-Control": "no-store"},
    )


from pydantic import BaseModel
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask


class RecordRequest(BaseModel):
    recording_id: str


@router.post("/record/start")
async def start_recording():
    """Start a private, temporary recording session."""
    return await iq_recorder.start_recording()


@router.post("/record/stop")
async def stop_recording(request: RecordRequest):
    state = await iq_recorder.stop_recording(request.recording_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    return state


@router.get("/record/state/{recording_id}")
async def get_recording_state(recording_id: str):
    state = await iq_recorder.get_state(recording_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    return state


@router.get("/record/download/{recording_id}")
async def download_recording(recording_id: str):
    recording = await iq_recorder.prepare_download(recording_id)
    if recording is None:
        raise HTTPException(status_code=404, detail="Запись недоступна")
    return FileResponse(
        path=str(recording.path),
        filename=recording.filename,
        media_type="application/octet-stream",
        background=BackgroundTask(iq_recorder.remove_download, recording),
        headers={"Cache-Control": "no-store"},
    )


@router.post("/record/cancel")
async def cancel_recording(request: RecordRequest):
    await iq_recorder.cancel(request.recording_id)
    return {"cancelled": True}
