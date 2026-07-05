"""Серверная логика отборочных AIS-заданий."""
from __future__ import annotations

import base64
import csv
import io
import json
import secrets
import sys
from pathlib import Path
from typing import Any

AIS_SIM = Path(__file__).resolve().parent.parent / "AIS_sim"
if str(AIS_SIM) not in sys.path:
    sys.path.insert(0, str(AIS_SIM))

from ais_engine import LEVEL_COUNTS, LEVEL_MAX_SCORE, build_challenge  # noqa: E402


def new_session_token() -> str:
    return secrets.token_urlsafe(24)


def encode_reference(reference: list[dict[str, Any]]) -> str:
    raw = json.dumps(reference, ensure_ascii=False).encode("utf-8")
    return base64.b64encode(raw).decode("ascii")


def decode_reference(encoded: str) -> list[dict[str, Any]]:
    raw = base64.b64decode(encoded.encode("ascii"))
    return json.loads(raw.decode("utf-8"))


def create_session(level: int) -> dict[str, Any]:
    seed = secrets.randbits(63)
    challenge = build_challenge(level=level, seed=seed)
    return {
        "level": level,
        "seed": seed,
        "packet_count": challenge["packet_count"],
        "input_rows": challenge["input_rows"],
        "reference_enc": encode_reference(challenge["reference"]),
    }


def parse_answer_csv(content: str) -> list[dict[str, str]]:
    text = content.strip()
    if not text:
        return []
    reader = csv.DictReader(io.StringIO(text))
    rows = []
    for row in reader:
        cleaned = {k.strip(): (v.strip() if isinstance(v, str) else v) for k, v in row.items() if k}
        if any(cleaned.values()):
            rows.append(cleaned)
    return rows


def _norm_mmsi(v) -> str:
    return str(v).strip()


def _norm_float(v, digits=4) -> str:
    try:
        return f"{float(v):.{digits}f}"
    except Exception:
        return ""


def _row_key_level1(row: dict) -> tuple:
    return (_norm_mmsi(row.get("mmsi")),)


def _row_key_multi(row: dict) -> tuple:
    return (
        _norm_mmsi(row.get("mmsi")),
        _norm_float(row.get("lat"), 4),
        _norm_float(row.get("lon"), 4),
        _norm_float(row.get("speed"), 1),
        str(row.get("last_seen", "")).strip(),
    )


def _has_map_points(rows: list[dict]) -> bool:
    for row in rows:
        try:
            lat = float(row.get("lat", ""))
            lon = float(row.get("lon", ""))
            if -90 <= lat <= 90 and -180 <= lon <= 180:
                return True
        except Exception:
            continue
    return False


def score_submission(
    level: int,
    reference: list[dict[str, Any]],
    participant: list[dict[str, str]],
    *,
    used_custom_decoder: bool = False,
    has_map_visualization: bool = False,
) -> dict[str, Any]:
    max_score = LEVEL_MAX_SCORE[level]

    if level == 1:
        ref_set = {_row_key_level1(r) for r in reference}
        part_set = {_row_key_level1(r) for r in participant if r.get("mmsi")}
        matched = len(ref_set & part_set)
        core_ratio = matched / len(ref_set) if ref_set else 0.0
        core_score = round(max_score * core_ratio, 2)

        name_bonus = 0.0
        type_bonus = 0.0
        if participant and any(r.get("name") for r in participant):
            name_bonus = round(max_score * 0.33 * core_ratio, 2)
        if participant and any(r.get("type") for r in participant):
            type_bonus = round(max_score * 0.34 * core_ratio, 2)
        bonus = 0.0
        if used_custom_decoder:
            bonus += 2.0
        total = min(max_score, round(core_score + name_bonus + type_bonus + bonus, 2))
        return {
            "level": level,
            "reference_rows": len(ref_set),
            "participant_rows": len(part_set),
            "matched": matched,
            "core_score": core_score,
            "bonus_score": round(name_bonus + type_bonus + bonus, 2),
            "total_score": total,
            "max_score": max_score,
            "used_custom_decoder": used_custom_decoder,
            "has_map_visualization": has_map_visualization,
            "details": {
                "mmsi_score": core_score,
                "name_score": name_bonus,
                "type_score": type_bonus,
                "custom_decoder_bonus": bonus if used_custom_decoder else 0.0,
            },
        }

    ref_set = {_row_key_multi(r) for r in reference}
    part_set = {_row_key_multi(r) for r in participant if r.get("mmsi")}
    matched = len(ref_set & part_set)
    core_ratio = matched / len(ref_set) if ref_set else 0.0

    if level == 2:
        csv_max, map_max = 15, 10
        core_score = round(csv_max * core_ratio, 2)
        map_score = 0.0
        if has_map_visualization and _has_map_points(participant):
            map_score = round(map_max * core_ratio, 2)
        bonus = 2.0 if used_custom_decoder else 0.0
        total = min(max_score, round(core_score + map_score + bonus, 2))
        return {
            "level": level,
            "reference_rows": len(ref_set),
            "participant_rows": len(part_set),
            "matched": matched,
            "core_score": core_score,
            "bonus_score": round(map_score + bonus, 2),
            "total_score": total,
            "max_score": max_score,
            "used_custom_decoder": used_custom_decoder,
            "has_map_visualization": has_map_visualization,
            "details": {
                "csv_score": core_score,
                "map_score": map_score,
                "custom_decoder_bonus": bonus,
            },
        }

    if level == 3:
        parse_max, dispatch_max = 20, 20
        parse_score = round(parse_max * core_ratio, 2)
        dispatch_score = 0.0
        if participant and len({r.get("mmsi") for r in participant if r.get("mmsi")}) >= len(
            {r.get("mmsi") for r in reference}
        ):
            dispatch_score = round(dispatch_max * core_ratio, 2)
        bonus = 2.0 if used_custom_decoder else 0.0
        total = min(max_score, round(parse_score + dispatch_score + bonus, 2))
        return {
            "level": level,
            "reference_rows": len(ref_set),
            "participant_rows": len(part_set),
            "matched": matched,
            "core_score": parse_score,
            "bonus_score": round(dispatch_score + bonus, 2),
            "total_score": total,
            "max_score": max_score,
            "used_custom_decoder": used_custom_decoder,
            "has_map_visualization": has_map_visualization,
            "details": {
                "parse_score": parse_score,
                "dispatch_score": dispatch_score,
                "custom_decoder_bonus": bonus,
            },
        }

    # level 4
    detect_max = 40
    core_score = round(detect_max * core_ratio, 2)
    bonus = 0.0
    if used_custom_decoder:
        bonus += 2.0
    if has_map_visualization and _has_map_points(participant):
        bonus += 3.0
    total = min(max_score, round(core_score + bonus, 2))
    return {
        "level": level,
        "reference_rows": len(ref_set),
        "participant_rows": len(part_set),
        "matched": matched,
        "core_score": core_score,
        "bonus_score": bonus,
        "total_score": total,
        "max_score": max_score,
        "used_custom_decoder": used_custom_decoder,
        "has_map_visualization": has_map_visualization,
        "details": {
            "detection_score": core_score,
            "custom_decoder_bonus": 2.0 if used_custom_decoder else 0.0,
            "map_bonus": 3.0 if has_map_visualization and _has_map_points(participant) else 0.0,
        },
    }


def input_to_csv(input_rows: list[dict[str, str]]) -> str:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=["timestamp", "ais_sentence"])
    writer.writeheader()
    writer.writerows(input_rows)
    return buf.getvalue()


def extract_instructions() -> str:
    docx = AIS_SIM / "Konkurs.docx"
    if not docx.exists():
        return ""
    import zipfile
    import xml.etree.ElementTree as ET

    with zipfile.ZipFile(docx) as z:
        xml = z.read("word/document.xml")
    root = ET.fromstring(xml)
    ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    paras = []
    for para in root.findall(".//w:p", ns):
        texts = [t.text for t in para.findall(".//w:t", ns) if t.text]
        if texts:
            paras.append("".join(texts))
    return "\n\n".join(paras)
