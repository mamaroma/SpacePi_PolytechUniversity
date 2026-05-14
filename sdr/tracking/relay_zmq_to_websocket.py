#!/usr/bin/env python3
"""Relay local GNU Radio ZMQ IQ stream to the public SDR WebSocket ingest."""

import argparse
import asyncio
import logging

import zmq
import zmq.asyncio

try:
    import websockets
except ImportError as exc:
    raise SystemExit("Install dependency first: pip install websockets pyzmq") from exc


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger("iq-relay")


async def relay(zmq_url: str, websocket_url: str) -> None:
    context = zmq.asyncio.Context()
    socket = context.socket(zmq.SUB)
    socket.setsockopt(zmq.SUBSCRIBE, b"")
    socket.connect(zmq_url)

    try:
        while True:
            logger.info("Connecting to %s", websocket_url)
            try:
                async with websockets.connect(
                    websocket_url,
                    ping_interval=20,
                    ping_timeout=20,
                    max_size=None,
                ) as ws:
                    logger.info("Connected; relaying IQ from %s", zmq_url)
                    frames = 0
                    bytes_sent = 0

                    while True:
                        data = await socket.recv()
                        if not data:
                            continue
                        await ws.send(data)
                        frames += 1
                        bytes_sent += len(data)
                        if frames % 1000 == 0:
                            logger.info("Relayed %s frames, %.1f MB", frames, bytes_sent / 1024 / 1024)

            except Exception as exc:
                logger.warning("Relay connection failed: %s; reconnecting in 3 seconds", exc)
                await asyncio.sleep(3)
    finally:
        socket.close()
        context.term()


def main() -> None:
    parser = argparse.ArgumentParser(description="Relay ZMQ complex64 IQ samples to SDR WebSocket ingest.")
    parser.add_argument(
        "--zmq",
        default="tcp://127.0.0.1:5555",
        help="Local GNU Radio ZMQ PUB address to subscribe to.",
    )
    parser.add_argument(
        "--ws",
        default="wss://poly-space.ru/sdr/ws/iq-ingest",
        help="Remote SDR IQ ingest WebSocket URL.",
    )
    args = parser.parse_args()

    asyncio.run(relay(args.zmq, args.ws))


if __name__ == "__main__":
    main()
