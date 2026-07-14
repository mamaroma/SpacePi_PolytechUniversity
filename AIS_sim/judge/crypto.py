"""Расшифровка эталона — только для проверяющих."""
import base64
import hashlib
import json
import zlib

# Тот же ключ, что в ais_core/seal_participant.py (open только здесь)
_SEAL_SALT = b"ais-contest-seal-v1"


def _derive_key(salt):
    return hashlib.sha256(_SEAL_SALT + salt.encode()).digest()


def open_run_blob(sealed_blob):
    encrypted = base64.b64decode(sealed_blob.encode("ascii"))
    key = _derive_key("run_blob")
    compressed = bytes(b ^ key[i % len(key)] for i, b in enumerate(encrypted))
    raw = zlib.decompress(compressed)
    data = json.loads(raw.decode("utf-8"))
    return data["seed"], data["reference"]
