LEVEL_MAX_POINTS = {1: 15, 2: 25, 3: 40, 4: 40}
CONTEST_MAX_POINTS = 120


def _float_or_none(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _norm_str(value):
    return str(value or "").strip().upper()


def grade_level1(reference_rows, participant_rows):
    ref_by_mmsi = {int(r["mmsi"]): r for r in reference_rows}
    part_by_mmsi = {}
    for r in participant_rows:
        try:
            part_by_mmsi[int(r["mmsi"])] = r
        except (TypeError, ValueError):
            continue

    mmsi_ok = 0
    name_ok = 0
    type_ok = 0
    missed = []
    details = []

    for mmsi, ref in ref_by_mmsi.items():
        part = part_by_mmsi.get(mmsi)
        if not part:
            missed.append(mmsi)
            continue
        mmsi_ok += 1
        if _norm_str(part.get("name")) == _norm_str(ref.get("name")):
            name_ok += 1
        if _norm_str(part.get("type")) == _norm_str(ref.get("type")):
            type_ok += 1

    total = len(ref_by_mmsi) or 1
    mmsi_score = round(5 * mmsi_ok / total, 2)
    name_score = round(5 * name_ok / total, 2)
    type_score = round(5 * type_ok / total, 2)
    score = round(mmsi_score + name_score + type_score, 2)

    return {
        "level": 1,
        "score": score,
        "max_score": LEVEL_MAX_POINTS[1],
        "breakdown": {
            "mmsi": {"score": mmsi_score, "max": 5, "matched": mmsi_ok, "total": total},
            "name": {"score": name_score, "max": 5, "matched": name_ok, "total": total},
            "type": {"score": type_score, "max": 5, "matched": type_ok, "total": total},
        },
        "missed_mmsi": sorted(missed),
        "extra_mmsi": sorted(set(part_by_mmsi) - set(ref_by_mmsi)),
    }


def _row_key(row):
    return (int(row["mmsi"]), row.get("last_seen", ""))


def grade_multi_level(reference_rows, participant_rows, level, lat_tol=0.001, lon_tol=0.001, speed_tol=0.5):
    ref_by_key = { _row_key(r): r for r in reference_rows }
    part_by_key = {}
    for r in participant_rows:
        if "lat" not in r or "lon" not in r:
            continue
        part_by_key[_row_key(r)] = r

    matched = 0
    mismatches = []
    for key, ref in ref_by_key.items():
        part = part_by_key.get(key)
        if not part:
            mismatches.append({"key": key, "reason": "missing"})
            continue
        lat_ok = abs(_float_or_none(ref["lat"]) - _float_or_none(part["lat"])) <= lat_tol
        lon_ok = abs(_float_or_none(ref["lon"]) - _float_or_none(part["lon"])) <= lon_tol
        speed_ok = abs(_float_or_none(ref["speed"]) - _float_or_none(part["speed"])) <= speed_tol
        if lat_ok and lon_ok and speed_ok:
            matched += 1
        else:
            mismatches.append({"key": key, "reason": "value_mismatch", "reference": ref, "participant": part})

    total = len(ref_by_key) or 1
    csv_max = {2: 15, 3: 20, 4: 40}[level]
    csv_score = round(csv_max * matched / total, 2)

    return {
        "level": level,
        "score": csv_score,
        "max_score": LEVEL_MAX_POINTS[level],
        "csv_score": csv_score,
        "csv_max": csv_max,
        "matched": matched,
        "total_reference": total,
        "mismatches": mismatches[:20],
    }


def grade_level2_map(has_visualization):
    map_score = 10 if has_visualization else 0
    return {"map_score": map_score, "map_max": 10}


def grade_level3_routes(reference_routes, participant_routes):
    if not reference_routes:
        return {"routes_score": 0, "routes_max": 20, "note": "эталон маршрутов не задан"}
    if not participant_routes:
        return {"routes_score": 0, "routes_max": 20, "note": "output_level3_routes.csv не найден"}

    ref_keys = {_row_key(r) for r in reference_routes}
    part_keys = {_row_key(r) for r in participant_routes if "lat" in r and "lon" in r}
    matched = len(ref_keys & part_keys)
    total = len(ref_keys) or 1
    routes_score = round(20 * matched / total, 2)
    return {"routes_score": routes_score, "routes_max": 20, "matched": matched, "total": total}


def grade_level4_spoof_zone(reference_zone, participant_zone):
    if not reference_zone or not participant_zone:
        return {"spoof_score": 0, "spoof_max": 10, "note": "зона спуфинга не указана участником"}
    try:
        lat_tol, lon_tol, rad_tol = 0.05, 0.05, 1.0
        lat_ok = abs(float(reference_zone["center_lat"]) - float(participant_zone["center_lat"])) <= lat_tol
        lon_ok = abs(float(reference_zone["center_lon"]) - float(participant_zone["center_lon"])) <= lon_tol
        rad_ok = abs(float(reference_zone["radius_nm"]) - float(participant_zone["radius_nm"])) <= rad_tol
        spoof_score = 10 if (lat_ok and lon_ok and rad_ok) else 5 if (lat_ok and lon_ok) else 0
    except (TypeError, ValueError, KeyError):
        spoof_score = 0
    return {"spoof_score": spoof_score, "spoof_max": 10}


def grade_submission(reference, participant_rows, extras=None):
    extras = extras or {}
    level = reference["level"]
    ref_rows = reference["rows"]

    if level == 1:
        return grade_level1(ref_rows, participant_rows)

    base = grade_multi_level(ref_rows, participant_rows, level)

    if level == 2:
        map_part = grade_level2_map(extras.get("has_visualization", False))
        base["breakdown"] = {"csv": base["csv_score"], "map": map_part["map_score"]}
        base["score"] = round(base["csv_score"] + map_part["map_score"], 2)

    elif level == 3:
        routes_part = grade_level3_routes(
            reference.get("routes_rows", []),
            extras.get("routes_rows", []),
        )
        base["breakdown"] = {"csv": base["csv_score"], "routes": routes_part["routes_score"]}
        base["score"] = round(base["csv_score"] + routes_part["routes_score"], 2)
        base["routes_detail"] = routes_part

    elif level == 4:
        csv_part = base["csv_score"]
        spoof_part = grade_level4_spoof_zone(
            reference.get("spoof_zone"),
            extras.get("spoof_zone"),
        )
        map_part = grade_level2_map(extras.get("has_visualization", False))
        # 40 = 25 csv + 10 map + 5 spoof (упрощённое распределение из 40)
        csv_scaled = round(25 * base["matched"] / (base["total_reference"] or 1), 2)
        map_scaled = map_part["map_score"]
        spoof_scaled = round(spoof_part["spoof_score"] * 0.5, 2)
        base["breakdown"] = {"csv": csv_scaled, "map": map_scaled, "spoof_zone": spoof_scaled}
        base["score"] = round(csv_scaled + map_scaled + spoof_scaled, 2)

    base["score"] = min(base["score"], LEVEL_MAX_POINTS[level])
    return base


def apply_bonus(base_result, plugins_info, decoder_grade=None):
    bonus = []
    total_bonus = 0

    if plugins_info.get("custom_decoder"):
        bonus.append({"name": "custom_decoder", "points": 5})
        total_bonus += 5
        if decoder_grade and decoder_grade.get("score", 0) >= 0.8 * decoder_grade.get("max_score", 100):
            bonus.append({"name": "custom_decoder_quality", "points": 5})
            total_bonus += 5

    if plugins_info.get("custom_map"):
        bonus.append({"name": "custom_map", "points": 5})
        total_bonus += 5

    base_result = dict(base_result)
    base_result["bonus"] = bonus
    base_result["bonus_points"] = total_bonus
    base_result["total_with_bonus"] = min(
        LEVEL_MAX_POINTS.get(base_result["level"], 100) + 15,
        base_result["score"] + total_bonus,
    )
    return base_result
