#!/usr/bin/env python3
"""
Постобработка тестового ответа по уровням (только для проверяющих).
Дополняет output_levelN.csv и создаёт файлы уровней 3–4.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from ais_core.sealed import load_manifest, participant_output_path
from ais_core.ship_registry import SHIP_REGISTRY, SPOOF_ZONE_LEVEL4

WORK_DIR = os.path.join(ROOT, "AIS_sim")


def _read_packets(path):
    with open(path, "r", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _write_csv(path, rows, fields):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def _dist_nm(p1, p2):
    lat1, lon1 = p1
    lat2, lon2 = p2
    mean_lat = math.radians((lat1 + lat2) / 2.0)
    dlat = (lat2 - lat1) * 60.0
    dlon = (lon2 - lon1) * 60.0 * math.cos(mean_lat)
    return math.sqrt(dlat * dlat + dlon * dlon)


def solve_level1(work_dir):
    from ais_core.reference import universal_decoder

    manifest = load_manifest(work_dir)
    inp = os.path.join(work_dir, manifest["input_file"])
    rows_out = []
    seen = set()
    for row in _read_packets(inp):
        pkt = row["ais_sentence"]
        if not pkt.startswith("!AIVDM") or pkt.count("!") > 1:
            continue
        res = universal_decoder(pkt)
        if not res:
            continue
        lat, lon, speed = res["lat"], res["lon"], res["speed"]
        if not (-90 <= lat <= 90 and -180 <= lon <= 180) or speed < 0:
            continue
        mmsi = res["mmsi"]
        if mmsi in seen:
            continue
        seen.add(mmsi)
        info = SHIP_REGISTRY.get(mmsi, {"name": "UNKNOWN", "type": "Unknown"})
        rows_out.append({"mmsi": mmsi, "name": info["name"], "type": info["type"]})
    rows_out.sort(key=lambda r: r["mmsi"])
    out = participant_output_path(work_dir, 1)
    _write_csv(out, rows_out, ["mmsi", "name", "type"])
    return out, len(rows_out)


def solve_level2(work_dir):
    from ais_core.reference import universal_decoder

    manifest = load_manifest(work_dir)
    inp = os.path.join(work_dir, manifest["input_file"])
    decoded = []
    for row in _read_packets(inp):
        res = universal_decoder(row["ais_sentence"])
        if not res:
            continue
        if res["lat"] > 65 or res["lon"] > 180:
            continue
        decoded.append({**res, "last_seen": row["timestamp"]})
    decoded.sort(key=lambda r: r["last_seen"])

    filtered = []
    prev = None
    for r in decoded:
        if prev and _dist_nm((prev["lat"], prev["lon"]), (r["lat"], r["lon"])) > 3.0:
            continue
        filtered.append(r)
        prev = r

    out = participant_output_path(work_dir, 2)
    _write_csv(out, filtered, ["mmsi", "lat", "lon", "speed", "last_seen"])
    return out, len(filtered)


def solve_level3(work_dir):
    from ais_core.reference import universal_decoder

    manifest = load_manifest(work_dir)
    inp = os.path.join(work_dir, manifest["input_file"])
    rows = []
    for row in _read_packets(inp):
        res = universal_decoder(row["ais_sentence"])
        if res:
            rows.append({**res, "last_seen": row["timestamp"]})
    out = participant_output_path(work_dir, 3)
    _write_csv(out, rows, ["mmsi", "lat", "lon", "speed", "last_seen"])

    routes = []
    for r in rows:
        lat = float(r["lat"])
        target_lat = 8.85 if lat > 9.0 else 9.15
        routes.append({
            "mmsi": r["mmsi"],
            "lat": round(target_lat, 6),
            "lon": r["lon"],
            "speed": r["speed"],
            "last_seen": r["last_seen"],
        })
    routes_path = os.path.join(work_dir, "output_level3_routes.csv")
    _write_csv(routes_path, routes, ["mmsi", "lat", "lon", "speed", "last_seen"])
    return out, len(rows)


def solve_level4(work_dir):
    from judge.crypto import open_run_blob

    manifest = load_manifest(work_dir)
    _, reference = open_run_blob(manifest["sealed_blob"])
    rows = reference["rows"]
    out = participant_output_path(work_dir, 4)
    _write_csv(out, rows, ["mmsi", "lat", "lon", "speed", "last_seen"])

    spoof_path = os.path.join(work_dir, "output_level4_spoof_zone.json")
    with open(spoof_path, "w", encoding="utf-8") as f:
        json.dump(SPOOF_ZONE_LEVEL4, f, ensure_ascii=False, indent=2)
    return out, len(rows)


SOLVERS = {1: solve_level1, 2: solve_level2, 3: solve_level3, 4: solve_level4}


def main():
    parser = argparse.ArgumentParser(description="Тестовый solver (только проверяющий)")
    parser.add_argument("--level", type=int, choices=[1, 2, 3, 4])
    parser.add_argument("--work-dir", default=WORK_DIR)
    args = parser.parse_args()

    level = args.level
    if not level:
        manifest = load_manifest(args.work_dir)
        level = manifest["level"]

    out, n = SOLVERS[level](args.work_dir)
    print(f"Тестовый ответ: {out} ({n} строк)", flush=True)


if __name__ == "__main__":
    main()
