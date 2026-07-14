#!/usr/bin/env python3
"""
Полный тест пути участника (только для проверяющих).

  python3 judge/run_test_path.py --level 2
  python3 judge/run_test_path.py --level 4 --mode solver
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

WORK_DIR = os.path.join(ROOT, "AIS_sim")
TEST_DIR = os.path.join(ROOT, "judge", "test_solution")


def _run(cmd, **kwargs):
    print("$", " ".join(cmd), flush=True)
    subprocess.run(cmd, cwd=ROOT, check=True, **kwargs)


def _install_test_plugins():
    """Копирует тестовые decoder.py / map.py в корень для бонуса в submission."""
    for name in ("decoder.py", "map.py"):
        src = os.path.join(TEST_DIR, name)
        dst = os.path.join(ROOT, name)
        if os.path.isfile(src):
            shutil.copy2(src, dst)
            print(f"Скопирован тестовый плагин: {name}", flush=True)


def _cleanup_test_plugins():
    for name in ("decoder.py", "map.py"):
        path = os.path.join(ROOT, name)
        if os.path.isfile(path):
            os.remove(path)
            print(f"Удалён временный {name}", flush=True)


def run_reference_mode(level: int, keep_plugins: bool):
    _run([sys.executable, "main.py", "--level", str(level)])

    from ais_core.sealed import create_submission_package, load_manifest, participant_output_path
    from judge.crypto import open_run_blob
    from ais_core.ship_registry import SPOOF_ZONE_LEVEL4
    import csv

    manifest = load_manifest(WORK_DIR)
    _, reference = open_run_blob(manifest["sealed_blob"])
    out_path = participant_output_path(WORK_DIR, level)
    fields = reference.get("fields") or list(reference["rows"][0].keys())
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(reference["rows"])
    print(f"Шаг 2 (reference): {out_path}, строк: {len(reference['rows'])}", flush=True)

    if level == 3 and reference.get("routes_rows"):
        routes_path = os.path.join(WORK_DIR, "output_level3_routes.csv")
        with open(routes_path, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
            w.writeheader()
            w.writerows(reference["routes_rows"])
    elif level == 3:
        _run([sys.executable, os.path.join("judge", "test_solution", "solver.py"), "--level", "3"])

    if level == 4:
        spoof_path = os.path.join(WORK_DIR, "output_level4_spoof_zone.json")
        zone = reference.get("spoof_zone") or SPOOF_ZONE_LEVEL4
        with open(spoof_path, "w", encoding="utf-8") as f:
            json.dump(zone, f, ensure_ascii=False, indent=2)

    if keep_plugins:
        _install_test_plugins()

    from participant_map import render_map_to_html

    if level in (2, 3, 4):
        html_path, msg = render_map_to_html(out_path, project_root=ROOT)
        print(f"Шаг 3: {msg}", flush=True)

    sub_path, meta = create_submission_package(WORK_DIR, participant_name="TEST_ORGANIZER")
    print(f"Шаг 4: {sub_path}", flush=True)

    report_path = os.path.join(WORK_DIR, "test_grade_report.json")
    _run([
        sys.executable,
        os.path.join("judge", "ais_judge.py"),
        sub_path,
        "--json-out",
        report_path,
    ])

    with open(report_path, "r", encoding="utf-8") as f:
        report = json.load(f)
    score = report.get("grading", {}).get("score")
    print(f"\n=== Итог: уровень {level}, баллы {score} ===", flush=True)
    print(f"Отчёт: {report_path}", flush=True)
    print(f"Submission для портала: {sub_path}", flush=True)

    if not keep_plugins:
        _cleanup_test_plugins()


def run_solver_mode(level: int, keep_plugins: bool):
    _run([sys.executable, "main.py", "--level", str(level)])
    if keep_plugins:
        _install_test_plugins()
    _run([sys.executable, os.path.join("judge", "test_solution", "solver.py"), "--level", str(level)])
    _run([sys.executable, "participant_map.py", "--csv", os.path.join("AIS_sim", f"output_level{level}.csv")])

    from ais_core.sealed import create_submission_package

    sub_path, _ = create_submission_package(WORK_DIR, participant_name="TEST_SOLVER")
    report_path = os.path.join(WORK_DIR, "test_grade_report.json")
    _run([
        sys.executable,
        os.path.join("judge", "ais_judge.py"),
        sub_path,
        "--json-out",
        report_path,
    ])
    with open(report_path, "r", encoding="utf-8") as f:
        report = json.load(f)
    print(f"\n=== solver mode: баллы {report.get('grading', {}).get('score')} ===", flush=True)
    if not keep_plugins:
        _cleanup_test_plugins()


def main():
    parser = argparse.ArgumentParser(description="Полный тест пути участника")
    parser.add_argument("--level", type=int, required=True, choices=[1, 2, 3, 4])
    parser.add_argument(
        "--mode",
        choices=["reference", "solver"],
        default="reference",
        help="reference = эталон из sealed (100%%), solver = тестовый solver.py",
    )
    parser.add_argument("--keep-plugins", action="store_true", help="Не удалять decoder.py/map.py после теста")
    args = parser.parse_args()

    if args.mode == "reference":
        run_reference_mode(args.level, args.keep_plugins)
    else:
        run_solver_mode(args.level, args.keep_plugins)


if __name__ == "__main__":
    main()
