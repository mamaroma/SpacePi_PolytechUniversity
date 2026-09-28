"""Start the local API with the Windows event loop needed by the SDR stream."""

import asyncio
import sys
from pathlib import Path

import uvicorn


sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

uvicorn.run(
    "app.main:app",
    host="127.0.0.1",
    port=8000,
    log_level="warning",
    access_log=False,
    timeout_graceful_shutdown=5,
)
