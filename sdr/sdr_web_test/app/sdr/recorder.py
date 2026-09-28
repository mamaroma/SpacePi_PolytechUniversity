"""Short-lived IQ spooling for a browser-initiated download."""
import asyncio
import atexit
import logging
import os
import secrets
import shutil
import tempfile
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import BinaryIO

import numpy as np

from .config import MAX_RECORDING_SIZE_GB

logger = logging.getLogger(__name__)
MAX_BYTES = int(MAX_RECORDING_SIZE_GB * 1024**3)
ACTIVE_TTL = 60 * 60
DOWNLOAD_TTL = 10 * 60


@dataclass
class Recording:
    token: str
    path: Path
    filename: str
    handle: BinaryIO | None
    created_at: float
    finished_at: float | None = None
    size: int = 0
    limit_reached: bool = False

    def state(self) -> dict:
        return {
            "recording_id": self.token,
            "is_recording": self.handle is not None,
            "file_size_bytes": self.size,
            "limit_reached": self.limit_reached,
            "download_url": f"/sdr/api/record/download/{self.token}" if self.handle is None else None,
        }


class IQRecorder:
    """Independent browser sessions; files exist only until download or expiry."""

    def __init__(self):
        self._directory = Path(tempfile.mkdtemp(prefix="polyspace-sdr-"))
        lock_path = self._directory / ".owner"
        self._owner_handle = lock_path.open("w+b")
        self._owner_handle.write(b"1")
        self._owner_handle.flush()
        self._owner_handle.seek(0)
        self._lock_owner(self._owner_handle)
        self._sessions: dict[str, Recording] = {}
        self._lock = asyncio.Lock()
        atexit.register(self._cleanup_sync)

    @staticmethod
    def _lock_owner(handle):
        if os.name == "nt":
            import msvcrt
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)

    @staticmethod
    def _unlock_owner(handle):
        if os.name == "nt":
            import msvcrt
            msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)

    def cleanup_orphans(self):
        """Remove crashed instances' temporary files, never active instances'."""
        temp_root = Path(tempfile.gettempdir()).resolve()
        own_directory = self._directory.resolve()
        for candidate in temp_root.glob("polyspace-sdr-*"):
            try:
                target = candidate.resolve()
                if not candidate.is_dir() or target.parent != temp_root or target == own_directory:
                    continue
                owner = target / ".owner"
                if not owner.is_file():
                    continue
                with owner.open("r+b") as handle:
                    self._lock_owner(handle)
                    self._unlock_owner(handle)
                shutil.rmtree(target)
            except OSError:
                # Another instance may own this directory, or Windows may deny
                # access to a stale directory. Neither should stop API startup.
                continue

    async def start_recording(self) -> dict:
        async with self._lock:
            token = secrets.token_urlsafe(32)
            stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
            path = self._directory / f"{token}.iq"
            recording = Recording(token, path, f"PolySpace_IQ_{stamp}.iq", path.open("xb"), time.monotonic())
            self._sessions[token] = recording
            return recording.state()

    async def stop_recording(self, token: str) -> dict | None:
        async with self._lock:
            recording = self._sessions.get(token)
            if recording is None:
                return None
            self._finish(recording)
            return recording.state()

    async def get_state(self, token: str) -> dict | None:
        async with self._lock:
            recording = self._sessions.get(token)
            return recording.state() if recording else None

    async def write_samples(self, samples: np.ndarray):
        async with self._lock:
            active = [entry for entry in self._sessions.values() if entry.handle is not None]
            if not active:
                return
            payload = np.asarray(samples, dtype=np.complex64).tobytes()
            for recording in active:
                try:
                    remaining = MAX_BYTES - recording.size
                    if remaining < len(payload):
                        recording.limit_reached = True
                        self._finish(recording)
                        continue
                    recording.handle.write(payload)
                    recording.size += len(payload)
                    if recording.size >= MAX_BYTES:
                        recording.limit_reached = True
                        self._finish(recording)
                except OSError:
                    logger.exception("IQ temporary recording failed")
                    self._delete(recording)

    async def prepare_download(self, token: str) -> Recording | None:
        async with self._lock:
            recording = self._sessions.get(token)
            if recording is None or recording.handle is not None:
                return None
            return self._sessions.pop(token)

    async def cancel(self, token: str):
        async with self._lock:
            recording = self._sessions.get(token)
            if recording:
                self._delete(recording)

    async def sweep(self):
        now = time.monotonic()
        async with self._lock:
            for recording in list(self._sessions.values()):
                age = now - (recording.finished_at or recording.created_at)
                if age > (DOWNLOAD_TTL if recording.finished_at else ACTIVE_TTL):
                    self._delete(recording)

    async def shutdown(self):
        async with self._lock:
            self._cleanup_sync()

    def _cleanup_sync(self):
        # Also runs when startup fails before FastAPI reaches its shutdown hook.
        for recording in list(self._sessions.values()):
            try:
                self._delete(recording)
            except OSError:
                logger.exception("Could not remove temporary IQ recording")
        if self._owner_handle is not None:
            try:
                self._unlock_owner(self._owner_handle)
            finally:
                self._owner_handle.close()
                self._owner_handle = None
        if self._directory.exists():
            try:
                shutil.rmtree(self._directory)
            except OSError:
                # An in-progress download can still hold a file open on Windows.
                # The next instance removes this directory in cleanup_orphans().
                logger.warning("Temporary IQ directory remains: %s", self._directory)

    def remove_download(self, recording: Recording):
        recording.path.unlink(missing_ok=True)

    def _finish(self, recording: Recording):
        if recording.handle is not None:
            recording.handle.close()
            recording.handle = None
            recording.finished_at = time.monotonic()

    def _delete(self, recording: Recording):
        self._finish(recording)
        recording.path.unlink(missing_ok=True)
        self._sessions.pop(recording.token, None)


iq_recorder = IQRecorder()
