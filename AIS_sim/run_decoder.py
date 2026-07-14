#!/usr/bin/env python3
"""
Вспомогательный скрипт: прогон decoder.py по сырым пакетам.
Удобно для тестирования собственного декодера.
"""
import argparse
import csv
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from ais_core.plugins import detect_plugins, load_decoder_module
from ais_core.reference import universal_decoder
from ais_core.ship_registry import SHIP_REGISTRY
from ais_core.sealed import load_manifest, participant_output_path

WORK_DIR = os.path.join(ROOT, "AIS_sim")


def read_packets(path):
    packets = []
    with open(path, "r", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            packets.append((row["timestamp"], row["ais_sentence"]))
    return packets


def decode_packets(packets, level, use_custom=True, work_dir=None):
    module, path = (None, None)
    if use_custom:
        module, path = load_decoder_module(work_dir)

    decode_fn = module.decode_ais if module else universal_decoder
    if level == 1:
        mmsi_set = set()
        for _, pkt in packets:
            res = decode_fn(pkt)
            if res:
                mmsi_set.add(res["mmsi"])
        rows = []
        for mmsi in sorted(mmsi_set):
            info = SHIP_REGISTRY.get(mmsi, {"name": "", "type": ""})
            rows.append({"mmsi": mmsi, "name": info["name"], "type": info["type"]})
        return rows, path

    rows = []
    for ts, pkt in packets:
        res = decode_fn(pkt)
        if res:
            row = dict(res)
            row.setdefault("last_seen", ts)
            rows.append(row)
    return rows, path


def write_output(path, rows, level):
    if level == 1:
        fields = ["mmsi", "name", "type"]
    else:
        fields = ["mmsi", "lat", "lon", "speed", "last_seen"]
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(description="Декодирование AIS пакетов участника")
    parser.add_argument("--work-dir", default=WORK_DIR)
    parser.add_argument("--builtin", action="store_true", help="Использовать встроенный декодер")
    args = parser.parse_args()

    work_dir = args.work_dir

    manifest = load_manifest(work_dir)
    level = manifest["level"]
    input_path = os.path.join(work_dir, manifest["input_file"])
    output_path = participant_output_path(work_dir, level)

    packets = read_packets(input_path)
    rows, decoder_path = decode_packets(packets, level, use_custom=not args.builtin, work_dir=work_dir)
    write_output(output_path, rows, level)

    plugins = detect_plugins(work_dir)
    print(f"Декодировано строк: {len(rows)}", flush=True)
    print(f"Сохранено: {output_path}", flush=True)
    if decoder_path:
        print(f"Использован decoder.py: {decoder_path}")
    elif plugins["custom_decoder"]:
        print("decoder.py найден, но не загружен (используйте без --builtin)")
    else:
        print("Использован встроенный эталонный декодер (для отладки)")


if __name__ == "__main__":
    main()
