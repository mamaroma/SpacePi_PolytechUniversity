#!/usr/bin/env python3
"""Сборка архива для участника (без judge-инструментов и эталонов)."""
from __future__ import annotations

import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_ZIP = ROOT.parent / "AIS_sim_participant.zip"

INCLUDE = [
    "Konkurs.docx",
    "INSTRUCTION_PARTICIPANT.md",
    "README.txt",
    "main.py",
    "ais_engine.py",
    "participant_decoder_template.py",
    "participant_map_template.py",
]

REMOVE_PATTERNS = [
    "input_level*.csv",
    "output_level*.csv",
    "reference_level*.csv",
    "participant_output.csv",
    "*.map.html",
]


def cleanup_generated():
    for pattern in REMOVE_PATTERNS:
        for p in ROOT.glob(pattern):
            p.unlink(missing_ok=True)
            print(f"Удалён: {p.name}")


def build_zip():
    cleanup_generated()
    if OUT_ZIP.exists():
        OUT_ZIP.unlink()
    with zipfile.ZipFile(OUT_ZIP, "w", zipfile.ZIP_DEFLATED) as zf:
        for name in INCLUDE:
            path = ROOT / name
            if path.exists():
                zf.write(path, arcname=f"AIS_sim/{name}")
                print(f"Добавлен: {name}")
            else:
                print(f"Пропущен (нет файла): {name}")
    print(f"\nГотово: {OUT_ZIP}")


if __name__ == "__main__":
    build_zip()
