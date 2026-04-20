"""Automatic IQ recording service with timeline support."""
import os
import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional, List, Dict
import numpy as np
from pathlib import Path

logger = logging.getLogger(__name__)


class AutoRecorder:
    """Automatic IQ recorder that starts/stops based on data flow."""
    
    def __init__(self, recordings_dir: str = "data/recordings"):
        self.recordings_dir = Path(recordings_dir)
        self.recordings_dir.mkdir(parents=True, exist_ok=True)
        
        self.current_file: Optional[str] = None
        self.current_handle = None
        self.is_recording = False
        self.last_data_time = 0
        self.recording_start_time: Optional[datetime] = None
        
        # Timeout для определения окончания потока (секунды)
        self.stream_timeout = 5.0
        
        # Задача для мониторинга потока
        self._monitor_task: Optional[asyncio.Task] = None
        
    async def start_monitoring(self):
        """Start monitoring data stream."""
        if self._monitor_task is None:
            self._monitor_task = asyncio.create_task(self._monitor_stream())
            logger.info("Started auto-recording monitor")
    
    async def stop_monitoring(self):
        """Stop monitoring data stream."""
        if self._monitor_task:
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass
            self._monitor_task = None
        
        await self._stop_recording()
        logger.info("Stopped auto-recording monitor")
    
    async def process_samples(self, samples: np.ndarray):
        """Process incoming IQ samples and handle recording."""
        current_time = asyncio.get_event_loop().time()  # Use asyncio time consistently
        self.last_data_time = current_time
        
        # Начинаем запись если еще не записываем
        if not self.is_recording:
            await self._start_recording()
        
        # Записываем данные
        if self.current_handle and self.is_recording:
            try:
                # Записываем как complex64 (совместимо с GNU Radio)
                samples_bytes = samples.astype(np.complex64).tobytes()
                self.current_handle.write(samples_bytes)
                await asyncio.get_event_loop().run_in_executor(None, self.current_handle.flush)
            except Exception as e:
                logger.error(f"Error writing samples: {e}")
    
    async def _monitor_stream(self):
        """Monitor data stream and stop recording when stream ends."""
        while True:
            try:
                await asyncio.sleep(1.0)  # Проверяем каждую секунду
                
                if self.is_recording and self.last_data_time > 0:
                    current_time = asyncio.get_event_loop().time()  # Use same time source
                    time_since_data = current_time - self.last_data_time
                    
                    # Если данных нет дольше timeout - останавливаем запись
                    if time_since_data > self.stream_timeout:
                        logger.info(f"No data for {time_since_data:.1f}s, stopping recording")
                        await self._stop_recording()
                        
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in stream monitor: {e}")
    
    async def _start_recording(self):
        """Start new recording."""
        if self.is_recording:
            return
        
        try:
            # Генерируем имя файла с временной меткой
            now = datetime.now()
            filename = now.strftime("%Y%m%d_%H%M%S.iq")
            filepath = self.recordings_dir / filename
            
            # Открываем файл для записи
            self.current_handle = open(filepath, 'wb')
            self.current_file = str(filepath)
            self.is_recording = True
            self.recording_start_time = now
            
            logger.info(f"Started auto-recording: {filename}")
            
        except Exception as e:
            logger.error(f"Failed to start recording: {e}")
            self.is_recording = False
    
    async def _stop_recording(self):
        """Stop current recording."""
        if not self.is_recording:
            return
        
        try:
            if self.current_handle:
                self.current_handle.close()
                self.current_handle = None
            
            if self.current_file:
                file_size = os.path.getsize(self.current_file)
                duration = (datetime.now() - self.recording_start_time).total_seconds()
                filename = os.path.basename(self.current_file)
                logger.info(f"Stopped auto-recording: {filename}, "
                           f"size: {file_size/1024/1024:.1f} MB, duration: {duration:.1f}s")
                
                # Send WebSocket notification for auto-download
                from .fft_service import fft_service
                await fft_service.broadcast_notification("auto_recording_stopped", {
                    "filename": filename,
                    "file_size": file_size,
                    "duration": duration
                })
            
            self.is_recording = False
            self.current_file = None
            self.recording_start_time = None
            
        except Exception as e:
            logger.error(f"Error stopping recording: {e}")
    
    def get_recording_info(self) -> Dict:
        """Get current recording information."""
        return {
            "is_recording": self.is_recording,
            "filename": os.path.basename(self.current_file) if self.current_file else None,
            "start_time": self.recording_start_time.isoformat() if self.recording_start_time else None,
            "file_size_bytes": os.path.getsize(self.current_file) if self.current_file and os.path.exists(self.current_file) else 0
        }
    
    async def cleanup_old_recordings(self, max_age_hours: int = 48):
        """Remove recordings older than specified hours."""
        try:
            cutoff_time = datetime.now() - timedelta(hours=max_age_hours)
            removed_count = 0
            
            for file_path in self.recordings_dir.glob("*.iq"):
                try:
                    # Получаем время создания файла
                    file_time = datetime.fromtimestamp(file_path.stat().st_ctime)
                    
                    if file_time < cutoff_time:
                        file_path.unlink()
                        removed_count += 1
                        logger.info(f"Removed old recording: {file_path.name}")
                        
                except Exception as e:
                    logger.error(f"Error removing file {file_path}: {e}")
            
            if removed_count > 0:
                logger.info(f"Cleaned up {removed_count} old recordings")
                
        except Exception as e:
            logger.error(f"Error during cleanup: {e}")
    
    def get_recordings_timeline(self, hours_back: int = 48) -> List[Dict]:
        """Get timeline of recordings for the last N hours."""
        try:
            cutoff_time = datetime.now() - timedelta(hours=hours_back)
            recordings = []
            
            for file_path in self.recordings_dir.glob("*.iq"):
                try:
                    stat = file_path.stat()
                    start_time = datetime.fromtimestamp(stat.st_ctime)
                    
                    if start_time >= cutoff_time:
                        # Примерная длительность на основе размера файла
                        # Предполагаем complex64 (8 байт на сэмпл) и sample_rate 625000
                        file_size = stat.st_size
                        samples_count = file_size // 8  # complex64 = 8 bytes
                        duration_seconds = samples_count / 625000  # sample_rate
                        
                        end_time = start_time + timedelta(seconds=duration_seconds)
                        
                        recordings.append({
                            "filename": file_path.name,
                            "start_time": start_time.isoformat(),
                            "end_time": end_time.isoformat(),
                            "duration_seconds": duration_seconds,
                            "file_size_bytes": file_size
                        })
                        
                except Exception as e:
                    logger.error(f"Error processing file {file_path}: {e}")
            
            # Сортируем по времени начала
            recordings.sort(key=lambda x: x['start_time'])
            return recordings
            
        except Exception as e:
            logger.error(f"Error getting timeline: {e}")
            return []


# Global auto-recorder instance — absolute path so CWD doesn't matter.
_SDR_BASE = Path(__file__).parent.parent.parent
auto_recorder = AutoRecorder(recordings_dir=str(_SDR_BASE / "data" / "recordings"))