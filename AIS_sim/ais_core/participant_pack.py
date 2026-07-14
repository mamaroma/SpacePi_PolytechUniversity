"""Сборка архива участника для скачивания с портала (без judge/)."""
from __future__ import annotations

import io
import os
import zipfile
from pathlib import Path

AIS_ROOT = Path(__file__).resolve().parent.parent

INCLUDE = [
    "main.py",
    "participant_map.py",
    "run_decoder.py",
    "decoder.py.example",
    "map.py.example",
    "README.md",
    "ZADANIE.md",
    "UCHASTNIK.md",
    "Konkurs.docx",
]

INCLUDE_DIRS = ["ais_core"]

EXCLUDE_DIRS = {"judge", ".idea", "__pycache__", ".git", "AIS_sim"}
EXCLUDE_FILES = {
    "INSTRUCTION.md",
    "CONTEST.md",
    "README.txt",
    "ais_map.py",
    "requirements-judge.txt",
    "pack_participant.py",
    "decoder.py",
    "map.py",
    "ais_engine.py",
}


def _should_skip(rel: str) -> bool:
    parts = rel.split(os.sep)
    if any(p in EXCLUDE_DIRS for p in parts):
        return True
    if os.path.basename(rel) in EXCLUDE_FILES:
        return True
    return rel.endswith(".pyc")


def _verify_names(names: list[str]) -> list[str]:
    bad = []
    for name in names:
        if name.startswith("judge/") or "/judge/" in name:
            bad.append(name)
        if "test_solution" in name:
            bad.append(name)
        base = os.path.basename(name)
        if base in ("crypto.py", "ais_judge.py", "run_test_path.py"):
            bad.append(name)
    return bad


def build_participant_zip_bytes() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name in INCLUDE:
            path = AIS_ROOT / name
            if path.is_file():
                zf.write(path, name)

        for dirname in INCLUDE_DIRS:
            dirpath = AIS_ROOT / dirname
            if not dirpath.is_dir():
                continue
            for root, dirs, files in os.walk(dirpath):
                dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
                for fname in files:
                    full = Path(root) / fname
                    rel = full.relative_to(AIS_ROOT).as_posix()
                    if _should_skip(rel):
                        continue
                    zf.write(full, rel)

        zf.writestr(
            "AIS_sim/README.txt",
            "Рабочая папка участника.\n"
            "Создаётся автоматически при Шаге 1 (main.py).\n"
            "decoder.py и map.py — в корне проекта, не здесь.\n",
        )

    data = buf.getvalue()
    with zipfile.ZipFile(io.BytesIO(data), "r") as zf:
        bad = _verify_names(zf.namelist())
        if bad:
            raise RuntimeError(f"Participant zip contains judge files: {bad}")
    return data
