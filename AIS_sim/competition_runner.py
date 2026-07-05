"""
competition_runner.py

Локальный раннер отборочного этапа.
Запуск:
  python competition_runner.py --level 2 --count 34 --out AIS_sim/session_level2

Сценарий:
1) Генерирует input_levelX.csv
2) Сохраняет скрытый эталон в .judge/reference_levelX.b64
3) Может проверить participant_output.csv и начислить баллы
4) Отмечает наличие participant_decoder.py и map.py как допзадания
"""

from __future__ import annotations

import argparse
import base64
import csv
import hashlib
import importlib.util
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from main import AISSimulator, reference_process_level1, reference_process_multi_level


@dataclass
class RunResult:
    generated_input: Path
    hidden_reference: Path
    report_path: Path


def _write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)


def _load_participant_decoder(path: Path):
    spec = importlib.util.spec_from_file_location("participant_decoder", str(path))
    if spec is None or spec.loader is None:
        return None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    fn = getattr(module, "decode_packets", None)
    return fn if callable(fn) else None


def generate_session(level: int, count: int, out_dir: Path) -> RunResult:
    sim = AISSimulator(level=level, num_packets=count)
    packets = sim.generate_packets(count_packets=count)

    input_rows = [{"timestamp": ts, "ais_sentence": pkt} for ts, pkt in packets]
    input_path = out_dir / f"input_level{level}.csv"
    _write_csv(input_path, input_rows, ["timestamp", "ais_sentence"])

    if level == 1:
        reference = reference_process_level1(packets)
    else:
        reference = reference_process_multi_level(packets)

    encoded = base64.b64encode(json.dumps(reference, ensure_ascii=False).encode("utf-8"))
    hidden_ref = out_dir / ".judge" / f"reference_level{level}.b64"
    hidden_ref.parent.mkdir(parents=True, exist_ok=True)
    hidden_ref.write_bytes(encoded)

    report = out_dir / "run_report.json"
    report.write_text(
        json.dumps(
            {
                "level": level,
                "count": count,
                "input_file": input_path.name,
                "reference_file": str(hidden_ref.relative_to(out_dir)),
                "reference_sha256": hashlib.sha256(encoded).hexdigest(),
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    return RunResult(generated_input=input_path, hidden_reference=hidden_ref, report_path=report)


def evaluate_submission(level: int, out_dir: Path) -> dict[str, Any]:
    input_path = out_dir / f"input_level{level}.csv"
    ref_path = out_dir / ".judge" / f"reference_level{level}.b64"
    participant_csv = out_dir / "participant_output.csv"
    participant_decoder = out_dir / "participant_decoder.py"
    participant_map = out_dir / "map.py"

    if not input_path.exists() or not ref_path.exists():
        raise FileNotFoundError("Сессия не найдена: сначала выполните генерацию.")

    encoded = ref_path.read_bytes()
    reference = json.loads(base64.b64decode(encoded).decode("utf-8"))

    used_custom_decoder = False
    if participant_decoder.exists():
        fn = _load_participant_decoder(participant_decoder)
        if fn is not None:
            used_custom_decoder = True
            with input_path.open("r", encoding="utf-8") as f:
                rows = list(csv.DictReader(f))
            decoded = fn(rows)
            if isinstance(decoded, list) and decoded:
                keys = sorted({k for row in decoded for k in row.keys()})
                _write_csv(participant_csv, decoded, keys)

    participant_rows = []
    if participant_csv.exists():
        with participant_csv.open("r", encoding="utf-8") as f:
            participant_rows = list(csv.DictReader(f))

    ref_count = len(reference)
    part_count = len(participant_rows)

    if level == 1:
        ref_m = {str(x.get("mmsi")) for x in reference}
        part_m = {str(x.get("mmsi")) for x in participant_rows if x.get("mmsi")}
        matched = len(ref_m & part_m)
        core_score = 100.0 if ref_m else 0.0
        if ref_m:
            core_score = round((matched / len(ref_m)) * 100, 2)
    else:
        ref_set = {
            (str(x.get("mmsi")), str(x.get("last_seen")), str(x.get("lat")), str(x.get("lon")))
            for x in reference
        }
        part_set = {
            (str(x.get("mmsi")), str(x.get("last_seen")), str(x.get("lat")), str(x.get("lon")))
            for x in participant_rows
        }
        matched = len(ref_set & part_set)
        core_score = round((matched / len(ref_set)) * 100, 2) if ref_set else 0.0

    bonus = 0
    if used_custom_decoder:
        bonus += 5
    if participant_map.exists():
        bonus += 5

    total = min(100.0, round(core_score + bonus, 2))
    result = {
        "level": level,
        "reference_rows": ref_count,
        "participant_rows": part_count,
        "matched": matched,
        "core_score": core_score,
        "bonus_score": bonus,
        "total_score": total,
        "used_custom_decoder": used_custom_decoder,
        "has_custom_map": participant_map.exists(),
    }
    (out_dir / "evaluation_result.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return result


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--level", type=int, default=1, choices=[1, 2, 3, 4])
    p.add_argument("--count", type=int, default=34)
    p.add_argument("--out", type=str, default="AIS_sim/session")
    p.add_argument("--evaluate", action="store_true", help="Оценить participant_output.csv")
    args = p.parse_args()

    out_dir = Path(args.out)
    run = generate_session(level=args.level, count=args.count, out_dir=out_dir)
    print(f"[OK] input: {run.generated_input}")
    print(f"[OK] hidden reference: {run.hidden_reference}")
    print(f"[OK] run report: {run.report_path}")

    if args.evaluate:
        result = evaluate_submission(level=args.level, out_dir=out_dir)
        print("[EVAL]", json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
