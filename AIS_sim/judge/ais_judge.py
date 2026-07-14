#!/usr/bin/env python3
"""
Инструмент проверяющих: оценка работы участника.
Расшифровывает эталон из submission.aispkg и сравнивает с ответом.
"""
import argparse
import csv
import io
import json
import os
import sys
import tempfile
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from ais_core.grading import apply_bonus, grade_submission
from ais_core.plugins import detect_plugins, run_custom_decoder_on_packets, run_custom_visualization
from ais_core.sealed import read_submission_package, verify_input_integrity
from ais_core.simulator import AISSimulator, packet_count_for_level
from judge.crypto import open_run_blob as open_run_data


def _load_participant_rows_from_csv_bytes(data):
    text = data.decode("utf-8")
    reader = csv.DictReader(io.StringIO(text))
    return list(reader)


def _read_packets_from_csv_bytes(data):
    text = data.decode("utf-8")
    reader = csv.DictReader(io.StringIO(text))
    return [(row["timestamp"], row["ais_sentence"]) for row in reader]


def verify_seed_reproducibility(manifest):
    level = manifest["level"]
    seed, reference = open_run_data(manifest["sealed_blob"])
    count = packet_count_for_level(level)
    sim = AISSimulator(level=level, num_packets=count, seed=seed)
    packets = sim.generate_packets(count_packets=count)
    from ais_core.reference import build_reference

    rebuilt = build_reference(packets, level, ships_data=sim.ships_data)
    return rebuilt["rows"] == reference["rows"]


def _extras_from_files(files, work_dir=None):
    extras = {
        "has_visualization": "visualization.html" in files
        or (work_dir and os.path.isfile(os.path.join(work_dir, "visualization.html"))),
    }
    if "output_level3_routes.csv" in files:
        extras["routes_rows"] = _load_participant_rows_from_csv_bytes(files["output_level3_routes.csv"])
    if "output_level4_spoof_zone.json" in files:
        extras["spoof_zone"] = json.loads(files["output_level4_spoof_zone.json"].decode("utf-8"))
    return extras


def grade_from_submission(submission_path, extract_dir=None):
    meta, files = read_submission_package(submission_path)
    manifest = meta["manifest"]
    _, reference = open_run_data(manifest["sealed_blob"])

    output_name = meta["output_file"]
    if output_name not in files:
        raise FileNotFoundError(f"В архиве нет {output_name}")

    participant_rows = _load_participant_rows_from_csv_bytes(files[output_name])
    extras = _extras_from_files(files, extract_dir)
    result = grade_submission(reference, participant_rows, extras=extras)

    plugins = meta.get("plugins", {})
    decoder_grade = None

    if extract_dir:
        os.makedirs(extract_dir, exist_ok=True)
        for name, content in files.items():
            out = os.path.join(extract_dir, os.path.basename(name))
            mode = "wb" if isinstance(content, bytes) else "w"
            if mode == "wb":
                with open(out, "wb") as f:
                    f.write(content)
            else:
                with open(out, "w", encoding="utf-8") as f:
                    f.write(content)

        plugins_live = detect_plugins(extract_dir)
        plugins = {**plugins, **plugins_live}

        if plugins_live.get("custom_decoder"):
            packets = _read_packets_from_csv_bytes(files[manifest["input_file"]])
            decoded_rows, _ = run_custom_decoder_on_packets(packets, work_dir=extract_dir)
            if decoded_rows is not None:
                decoder_grade = grade_submission(reference, decoded_rows)

        if plugins_live.get("custom_map"):
            input_csv = os.path.join(extract_dir, manifest["input_file"])
            output_csv = os.path.join(extract_dir, output_name)
            html_out = os.path.join(extract_dir, "judge_visualization.html")
            try:
                run_custom_visualization(input_csv, output_csv, output_html=html_out, work_dir=extract_dir)
            except Exception as exc:
                result.setdefault("warnings", []).append(f"map.py error: {exc}")

    final = apply_bonus(result, plugins, decoder_grade=decoder_grade)
    report = {
        "participant": meta.get("participant_name", "anonymous"),
        "submitted_at": meta.get("submitted_at"),
        "run_id": manifest.get("run_id"),
        "level": manifest["level"],
        "seed_verified": verify_seed_reproducibility(manifest),
        "plugins": plugins,
        "grading": final,
        "decoder_self_grade": decoder_grade,
    }
    return report


def grade_from_workdir(work_dir):
    from ais_core.sealed import SEALED_FILENAME, load_manifest, participant_output_path

    manifest = load_manifest(work_dir)
    ok, msg = verify_input_integrity(work_dir, manifest)
    if not ok:
        raise ValueError(msg)

    reference = open_run_data(manifest["sealed_blob"])[1]
    level = manifest["level"]
    out_path = participant_output_path(work_dir, level)
    with open(out_path, "r", encoding="utf-8") as f:
        participant_rows = list(csv.DictReader(f))

    extras = {"has_visualization": os.path.isfile(os.path.join(work_dir, "visualization.html"))}
    routes_path = os.path.join(work_dir, "output_level3_routes.csv")
    if os.path.isfile(routes_path):
        with open(routes_path, "r", encoding="utf-8") as f:
            extras["routes_rows"] = list(csv.DictReader(f))
    spoof_path = os.path.join(work_dir, "output_level4_spoof_zone.json")
    if os.path.isfile(spoof_path):
        with open(spoof_path, "r", encoding="utf-8") as f:
            extras["spoof_zone"] = json.load(f)

    result = grade_submission(reference, participant_rows, extras=extras)
    plugins = detect_plugins(work_dir)

    decoder_grade = None
    if plugins.get("custom_decoder"):
        import csv as csvmod

        input_path = os.path.join(work_dir, manifest["input_file"])
        with open(input_path, "r", encoding="utf-8") as f:
            packets = [(r["timestamp"], r["ais_sentence"]) for r in csvmod.DictReader(f)]
        decoded_rows, _ = run_custom_decoder_on_packets(packets, work_dir=work_dir)
        if decoded_rows is not None:
            decoder_grade = grade_submission(reference, decoded_rows)

    final = apply_bonus(result, plugins, decoder_grade=decoder_grade)
    return {
        "participant": "local",
        "level": level,
        "seed_verified": verify_seed_reproducibility(manifest),
        "plugins": plugins,
        "grading": final,
        "decoder_self_grade": decoder_grade,
    }


def main():
    parser = argparse.ArgumentParser(description="Проверка работ AIS (для организаторов)")
    parser.add_argument("path", help="submission.aispkg или каталог AIS_sim участника")
    parser.add_argument("--extract", help="Каталог для распаковки submission")
    parser.add_argument("--json-out", help="Сохранить отчёт в JSON")
    args = parser.parse_args()

    path = args.path
    if os.path.isfile(path) and path.endswith(".aispkg"):
        report = grade_from_submission(path, extract_dir=args.extract)
    elif os.path.isdir(path):
        report = grade_from_workdir(path)
    else:
        print("Укажите submission.aispkg или каталог AIS_sim")
        sys.exit(1)

    print(json.dumps(report, ensure_ascii=False, indent=2))
    if args.json_out:
        with open(args.json_out, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
