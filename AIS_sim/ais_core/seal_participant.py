"""Запечатка run-данных (seed + эталон). У участника только seal, без open."""
import base64
import hashlib
import json
import zlib

_SEAL_SALT = b"ais-contest-seal-v1"


def _derive_key(salt):
    return hashlib.sha256(_SEAL_SALT + salt.encode()).digest()


def seal_run_blob(seed, reference):
    payload = {"seed": seed, "reference": reference}
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    compressed = zlib.compress(raw, level=9)
    key = _derive_key("run_blob")
    encrypted = bytes(b ^ key[i % len(key)] for i, b in enumerate(compressed))
    return base64.b64encode(encrypted).decode("ascii")
