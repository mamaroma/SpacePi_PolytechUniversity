"""
competition_runner.py — инструмент проверяющего (НЕ для участника).

Запуск из папки AIS_sim:
  python judge/competition_runner.py --level 2 --out session_level2
  python judge/competition_runner.py --level 2 --out session_level2 --evaluate
"""
from __future__ import annotations

import argparse
import base64
import csv
import hashlib
import importlib.util
import json
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ais_engine import (  # noqa: E402
    AISSimulator,
    LEVEL_COUNTS,
    reference_process_level1,
    reference_process_multi_level,
)


@dataclass
class RunResult:
    generated_input: Path
    hidden_reference: Path
    report_path: Path


def _write_csv(path: Path, rows: list[dict], fieldnames: list[str]) -> None:
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


def evaluate_submission(level: int, out_dir: Path) -> dict:
    input_path = out_dir / f"input_level{level}.csv"
    ref_path = out_dir / ".judge" / f"reference_level{level}.b64"
    participant_csv = out_dir / "participant_output.csv"
    if not participant_csv.exists():
        alt = out_dir / f"output_level{level}.csv"
        if alt.exists():
            participant_csv = alt
    participant_decoder = out_dir / "participant_decoder.py"
    participant_map = out_dir / "participant_map.py"

    if not input_path.exists() or not ref_path.exists():
        raise FileNotFoundError("Сессия не найдена: сначала выполните генерацию.")

    reference = json.loads(base64.b64decode(ref_path.read_bytes()).decode("utf-8"))
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

    if level == 1:
        ref_m = {str(x.get("mmsi")) for x in reference}
        part_m = {str(x.get("mmsi")) for x in participant_rows if x.get("mmsi")}
        matched = len(ref_m & part_m)
        core_score = round((matched / len(ref_m)) * 100, 2) if ref_m else 0.0
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

    result = {
        "level": level,
        "reference_rows": len(reference),
        "participant_rows": len(participant_rows),
        "matched": matched,
        "core_score": core_score,
        "bonus_score": bonus,
        "total_score": min(100.0, round(core_score + bonus, 2)),
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
    p.add_argument("--count", type=int, default=None)
    p.add_argument("--out", type=str, default="session")
    p.add_argument("--evaluate", action="store_true")
    args = p.parse_args()
    count = args.count or LEVEL_COUNTS[args.level]
    out_dir = Path(args.out)
    if not out_dir.is_absolute():
        out_dir = ROOT / out_dir

    run = generate_session(level=args.level, count=count, out_dir=out_dir)
    print(f"[OK] input: {run.generated_input}")
    print(f"[OK] hidden reference: {run.hidden_reference}")
    if args.evaluate:
        print("[EVAL]", json.dumps(evaluate_submission(args.level, out_dir), ensure_ascii=False))


if __name__ == "__main__":
    main()
