"""FastAPI routes for SDR streaming application."""
import logging
from datetime import datetime, timezone
from typing import List, Dict
from fastapi import APIRouter, HTTPException, status
from .models import SignalInfo, PassList, SatellitePass, RecordingState, SystemInfo, SpectrumParams, SatelliteData
from .state import sdr_state
from .recorder import iq_recorder
from .satellite_service import satellite_service
from .auto_recorder import auto_recorder
from .playback_service import playback_service
from .fft_service import fft_service
from .config import DEFAULT_FFT_SIZE, DEFAULT_FFT_UPDATE_RATE, DEFAULT_SAMPLE_RATE

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["sdr"])


@router.get("/info", response_model=SystemInfo)
async def get_system_info():
    """Get system information and status."""
    return await sdr_state.get_system_info()


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
    passes = await sdr_state.get_satellite_passes()
    return passes


@router.get("/passes/next", response_model=SatellitePass)
async def get_next_pass():
    """Get the next upcoming satellite pass."""
    next_pass = satellite_service.get_active_or_next_pass()
    if not next_pass:
        raise HTTPException(status_code=404, detail="No upcoming satellite passes")
    return next_pass


@router.post("/record/start")
async def start_recording():
    """Start IQ recording."""
    try:
        recording_state = await sdr_state.get_recording_state()
        if recording_state.is_recording:
            raise HTTPException(status_code=400, detail="Recording already in progress")
        
        filename = await iq_recorder.start_recording()
        logger.info(f"Started recording: {filename}")
        return {"message": "Recording started", "filename": filename}
        
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to start recording: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/record/stop")
async def stop_recording():
    """Stop IQ recording."""
    try:
        recording_state = await sdr_state.get_recording_state()
        if not recording_state.is_recording:
            raise HTTPException(status_code=400, detail="No recording in progress")
        
        filename = await iq_recorder.stop_recording()
        logger.info("Stopped recording")
        return {"message": "Recording stopped", "filename": filename}
        
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to stop recording: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/record/state", response_model=RecordingState)
async def get_recording_state():
    """Get current recording state."""
    return await sdr_state.get_recording_state()


@router.get("/timeline")
async def get_recordings_timeline(hours_back: int = 48):
    """Get timeline of recordings for the last N hours."""
    try:
        timeline = auto_recorder.get_recordings_timeline(hours_back)
        return {"recordings": timeline}
    except Exception as e:
        logger.error(f"Failed to get timeline: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/auto-record/state")
async def get_auto_record_state():
    """Get current auto-recording state."""
    try:
        state = auto_recorder.get_recording_info()
        return state
    except Exception as e:
        logger.error(f"Failed to get auto-record state: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/playback/start")
async def start_playback(request: dict):
    """Start playback from specified time."""
    try:
        start_time = request.get("start_time")
        if not start_time:
            raise HTTPException(status_code=400, detail="start_time is required")
        
        target_time = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
        await playback_service.start_playback(target_time)
        return {"message": "Playback started", "start_time": start_time}
    except Exception as e:
        logger.error(f"Failed to start playback: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/playback/stop")
async def stop_playback():
    """Stop current playback."""
    try:
        await playback_service.stop_playback()
        return {"message": "Playback stopped"}
    except Exception as e:
        logger.error(f"Failed to stop playback: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/playback/seek")
async def seek_playback(request: dict):
    """Seek playback to specified time."""
    try:
        target_time = request.get("target_time")
        if not target_time:
            raise HTTPException(status_code=400, detail="target_time is required")
        
        seek_time = datetime.fromisoformat(target_time.replace('Z', '+00:00'))
        await playback_service.seek_to_time(seek_time)
        return {"message": "Seeked to time", "target_time": target_time}
    except Exception as e:
        logger.error(f"Failed to seek playback: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/playback/state")
async def get_playback_state():
    """Get current playback state."""
    try:
        state = playback_service.get_playback_state()
        return state
    except Exception as e:
        logger.error(f"Failed to get playback state: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/download/{filename}")
async def download_recording(filename: str):
    """Download a recording file."""
    try:
        from fastapi.responses import FileResponse
        import os
        
        # Validate filename (security)
        if not filename.endswith('.iq') or '/' in filename or '\\' in filename:
            raise HTTPException(status_code=400, detail="Invalid filename")
        
        from .config import RECORDINGS_DIR
        file_path = RECORDINGS_DIR / filename

        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="File not found")
        
        return FileResponse(
            path=str(file_path),
            filename=filename,
            media_type='application/octet-stream'
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to download file: {e}")
        raise HTTPException(status_code=500, detail=str(e))
