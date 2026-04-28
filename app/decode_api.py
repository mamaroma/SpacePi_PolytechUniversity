"""
Challenge decoders — used by the «Challenge» section of the UI.

* /api/decode/ais   — accepts a text file with !AIVDM lines, returns parsed JSON.
* /api/decode/telemetry — accepts a binary packet (LoRa-style), returns fields.
* /api/decode/iq    — accepts a raw IQ recording, returns a (mock) demodulated
                      payload using the same parameters that have to be set in
                      `gm.py` (sample rate, decimation, freq shift, …).
"""
from __future__ import annotations

import hashlib
import json
import struct
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Form

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/decode", tags=["decode"])


# ─── AIS ─────────────────────────────────────────────────────────────────────
_AIS_ATTRS = (
    "mmsi lon lat status turn speed accuracy course heading second "
    "maneuver spare_1 raim radio msg_type repeat"
).split()


def _decode_one_ais(line: str) -> Optional[dict]:
    try:
        from pyais import decode as ais_decode
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "Серверу не хватает библиотеки pyais. "
                "Установите её: pip install pyais"
            ),
        ) from exc

    line = line.strip()
    if not line or not line.startswith("!"):
        return None
    try:
        msg = ais_decode(line)
    except Exception:
        return None

    out: dict[str, Any] = {"raw": line}
    for attr in _AIS_ATTRS:
        try:
            v = getattr(msg, attr)
            if isinstance(v, bytes):
                v = v.decode("ascii", errors="replace")
            out[attr] = v
        except Exception:
            out[attr] = None
    return out


@router.post("/ais")
async def decode_ais(file: UploadFile = File(...)):
    raw = await file.read()
    try:
        text = raw.decode("utf-8", errors="replace")
    except Exception:
        text = raw.decode("latin-1", errors="replace")

    results: list[dict] = []
    errors = 0
    for line in text.splitlines():
        if not line.strip():
            continue
        try:
            decoded = _decode_one_ais(line)
        except HTTPException:
            raise
        if decoded is None:
            errors += 1
            continue
        results.append(decoded)

    return {
        "decoded": results,
        "count": len(results),
        "errors": errors,
        "filename": file.filename,
    }


# ─── Telemetry binary decoder ────────────────────────────────────────────────
# Формат для школьников:
#   bytes  0..1   sync 0xAA 0x55
#   bytes  2..3   sat_id  (uint16 LE)
#   bytes  4..7   timestamp (uint32 LE, секунды от UNIX epoch)
#   bytes  8..11  temp_c   (int32 LE * 100  → ºC c сотыми)
#   bytes 12..15  vbus_mv  (uint32 LE)
#   bytes 16..19  ibus_ma  (int32 LE)
#   bytes 20..21  battery_pct (uint16 LE * 10 → %)
#   bytes 22..23  rssi_dbm (int16 LE)
#   bytes 24..25  snr_db   (int16 LE)
#   bytes 26..29  uptime_sec (uint32 LE)
#   bytes 30..31  CRC-16  (CCITT-FALSE), big-endian
TELEMETRY_PACKET_LEN = 32


def _crc16_ccitt(data: bytes, poly: int = 0x1021, init: int = 0xFFFF) -> int:
    crc = init
    for b in data:
        crc ^= b << 8
        for _ in range(8):
            crc = ((crc << 1) ^ poly) & 0xFFFF if (crc & 0x8000) else (crc << 1) & 0xFFFF
    return crc


def _decode_telemetry_packet(buf: bytes) -> dict:
    if len(buf) < TELEMETRY_PACKET_LEN:
        return {"error": f"too short ({len(buf)} bytes, need {TELEMETRY_PACKET_LEN})"}

    sync = buf[0:2]
    sync_ok = sync == b"\xAA\x55"

    sat_id     = struct.unpack("<H", buf[2:4])[0]
    ts_unix    = struct.unpack("<I", buf[4:8])[0]
    temp_raw   = struct.unpack("<i", buf[8:12])[0]
    vbus_mv    = struct.unpack("<I", buf[12:16])[0]
    ibus_ma    = struct.unpack("<i", buf[16:20])[0]
    battery_raw= struct.unpack("<H", buf[20:22])[0]
    rssi_dbm   = struct.unpack("<h", buf[22:24])[0]
    snr_db     = struct.unpack("<h", buf[24:26])[0]
    uptime_sec = struct.unpack("<I", buf[26:30])[0]
    crc_recv   = struct.unpack(">H", buf[30:32])[0]

    crc_calc   = _crc16_ccitt(buf[0:30])
    crc_ok     = crc_recv == crc_calc

    return {
        "sync_ok": sync_ok,
        "sat_id": sat_id,
        "ts_unix": ts_unix,
        "ts_iso": datetime.fromtimestamp(ts_unix, tz=timezone.utc).isoformat()
                  if 1577836800 < ts_unix < 4102444800 else None,
        "temp_c": temp_raw / 100.0,
        "vbus_mv": vbus_mv,
        "ibus_ma": ibus_ma,
        "battery_pct": battery_raw / 10.0,
        "rssi_dbm": rssi_dbm,
        "snr_db": snr_db,
        "uptime_sec": uptime_sec,
        "crc_recv": f"0x{crc_recv:04X}",
        "crc_calc": f"0x{crc_calc:04X}",
        "crc_ok": crc_ok,
    }


@router.post("/telemetry")
async def decode_telemetry(file: UploadFile = File(...)):
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "empty file")

    packets: list[dict] = []
    offset = 0
    n = 0
    while offset + TELEMETRY_PACKET_LEN <= len(raw):
        chunk = raw[offset:offset + TELEMETRY_PACKET_LEN]
        decoded = _decode_telemetry_packet(chunk)
        decoded["offset"] = offset
        decoded["hex"]    = chunk.hex(" ")
        packets.append(decoded)
        offset += TELEMETRY_PACKET_LEN
        n += 1
        if n > 1000:
            break

    return {
        "filename": file.filename,
        "size_bytes": len(raw),
        "packet_len": TELEMETRY_PACKET_LEN,
        "packets": packets,
        "count": len(packets),
    }


# ─── Demodulation (gm.py mock) ───────────────────────────────────────────────
@router.post("/iq")
async def demod_iq(
    file: UploadFile = File(...),
    sample_rate: float = Form(250000.0),
    center_freq: float = Form(437845000.0),
    bandwidth: float = Form(62500.0),
    spreading_factor: int = Form(8),
    decimation: int = Form(40),
    interpolation: int = Form(1),
    cutoff_freq: float = Form(35000.0),
    transition_width: float = Form(10000.0),
    freq_shift: float = Form(60000.0),
    sync_word: int = Form(18),
    preamble_len: int = Form(8),
):
    """
    Имитирует пайплайн `gm.py`:
        file_source → rational_resampler → freq_shift →
        low_pass_filter → lora_sdr.frame_sync → fft_demod →
        gray_mapping → deinterleaver → hamming_dec →
        header_decoder → dewhitening → crc_verif → file_sink

    Реальная демодуляция требует GNU Radio + lora_sdr на хосте
    (и не всегда доступна в Web-окружении). Поэтому эндпоинт:
      • валидирует параметры так же, как они задаются в `gm.py`;
      • считает реалистичные метрики (длина записи, эффективная sample rate);
      • возвращает «декодированный» бинарник, чьи байты детерминированно
        зависят от хеша входного файла (для одного и того же raw.iq всегда
        получится один и тот же data.bin — как в реальном пайплайне).
    """
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "empty file")

    if interpolation < 1 or decimation < 1:
        raise HTTPException(400, "interpolation/decimation must be ≥ 1")

    # Каждое complex-сэмпл = 8 байт (real32 + imag32) — правило file_source у GR.
    sample_bytes = 8
    n_samples = len(raw) // sample_bytes
    duration_s = n_samples / sample_rate if sample_rate else 0.0

    effective_rate = sample_rate * interpolation / decimation

    h = hashlib.sha256(raw).digest()
    bytes_out = (h * 16)[: max(8, n_samples // 4096)]
    payload_bytes = bytes_out[:64]  # имитируем «короткий» payload, как у LoRa

    # «Расшифрованный» текст (если CRC OK)
    crc_ok = (h[0] & 0x07) != 0     # ~87 % успех — реалистично для слабого сигнала
    decoded_payload = (
        f"Polytech_Universe-3 | T={(h[1] - 128) / 4:+.1f}C "
        f"| Vbus={(2400 + h[2] * 4)}mV "
        f"| pkt#{int.from_bytes(h[3:5], 'little')}"
        if crc_ok else None
    )

    return {
        "filename": file.filename,
        "size_bytes": len(raw),
        "n_samples": n_samples,
        "duration_s": round(duration_s, 4),
        "params": {
            "sample_rate": sample_rate,
            "center_freq": center_freq,
            "bandwidth": bandwidth,
            "spreading_factor": spreading_factor,
            "decimation": decimation,
            "interpolation": interpolation,
            "cutoff_freq": cutoff_freq,
            "transition_width": transition_width,
            "freq_shift": freq_shift,
            "sync_word": sync_word,
            "preamble_len": preamble_len,
        },
        "effective_sample_rate": effective_rate,
        "pipeline": [
            "file_source(raw.iq)",
            f"rational_resampler(↑{interpolation}/↓{decimation})",
            f"freq_shift({freq_shift/1e3:.1f} kHz)",
            f"low_pass_filter(cutoff={cutoff_freq/1e3:.1f} kHz, "
            f"transition={transition_width/1e3:.1f} kHz)",
            f"lora_sdr.frame_sync(SF={spreading_factor}, BW={bandwidth/1e3:.1f} kHz)",
            "fft_demod → gray_mapping → deinterleaver",
            "hamming_dec → header_decoder",
            "dewhitening → crc_verif",
            "file_sink(data.bin)",
        ],
        "crc_ok": crc_ok,
        "payload_hex": payload_bytes.hex(" "),
        "decoded_payload": decoded_payload,
    }
