"""Проверка ответа участника без раскрытия эталона."""
import csv
import json
import os

from ais_core.sealed import participant_output_path

# Ожидаемые диапазоны (ориентиры, не эталон)
LEVEL_HINTS = {
    1: {
        "columns": ["mmsi", "name", "type"],
        "row_min": 1,
        "row_max": 6,
        "desc": "уникальные MMSI + name + type",
    },
    2: {
        "columns": ["mmsi", "lat", "lon", "speed", "last_seen"],
        "row_min": 28,
        "row_max": 34,
        "unique_mmsi": 1,
        "desc": "один MMSI, связный трек без выбросов",
    },
    3: {
        "columns": ["mmsi", "lat", "lon", "speed", "last_seen"],
        "row_min": 10,
        "row_max": 14,
        "unique_mmsi_min": 10,
        "desc": "несколько судов у канала",
    },
    4: {
        "columns": ["mmsi", "lat", "lon", "speed", "last_seen"],
        "row_min": 40,
        "row_max": 60,
        "unique_mmsi": 4,
        "desc": "4 судна, истинные координаты",
    },
}


def _read_csv(path):
    with open(path, "r", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def validate_output(work_dir, level=None):
    """Возвращает dict: ok, messages[], warnings[], stats{}."""
    messages = []
    warnings = []
    stats = {}

    try:
        manifest_path = os.path.join(work_dir, "run_sealed.aispkg")
        if not os.path.isfile(manifest_path):
            return {"ok": False, "messages": ["Сначала выполните Шаг 1 (генерация)."], "warnings": [], "stats": {}}

        from ais_core.sealed import load_manifest

        manifest = load_manifest(work_dir)
        level = level or manifest["level"]
        out_path = participant_output_path(work_dir, level)

        if not os.path.isfile(out_path):
            return {
                "ok": False,
                "messages": [
                    f"Файл не найден: {out_path}",
                    "Шаг 2 выполняется ВАШЕЙ программой (не кнопкой в main.py).",
                    f"Сохраните результат декодирования в output_level{level}.csv",
                ],
                "warnings": [],
                "stats": {},
            }

        rows = _read_csv(out_path)
        hints = LEVEL_HINTS.get(level, {})
        stats["rows"] = len(rows)
        stats["level"] = level

        if not rows:
            return {"ok": False, "messages": ["Файл пустой."], "warnings": warnings, "stats": stats}

        # Колонки
        expected_cols = hints.get("columns", [])
        actual_cols = list(rows[0].keys())
        missing = [c for c in expected_cols if c not in actual_cols]
        if missing:
            messages.append(f"Отсутствуют колонки: {', '.join(missing)}")
            messages.append(f"Ожидаются: {', '.join(expected_cols)}")

        # Количество строк
        if "row_min" in hints and len(rows) < hints["row_min"]:
            warnings.append(
                f"Мало строк: {len(rows)} (обычно ≥ {hints['row_min']}). Возможно, фильтр слишком жёсткий."
            )
        if "row_max" in hints and len(rows) > hints["row_max"]:
            warnings.append(
                f"Много строк: {len(rows)} (обычно ≤ {hints['row_max']}). Возможно, не отфильтрован мусор."
            )

        # MMSI
        mmsi_set = set()
        for r in rows:
            try:
                mmsi_set.add(int(r.get("mmsi", 0)))
            except (TypeError, ValueError):
                pass
        stats["unique_mmsi"] = len(mmsi_set)

        if hints.get("unique_mmsi") and len(mmsi_set) != hints["unique_mmsi"]:
            warnings.append(
                f"Уникальных MMSI: {len(mmsi_set)} (ожидается {hints['unique_mmsi']})"
            )
        if hints.get("unique_mmsi_min") and len(mmsi_set) < hints["unique_mmsi_min"]:
            warnings.append(f"Мало уникальных MMSI: {len(mmsi_set)}")

        # Уровень 1: пустые name/type
        if level == 1:
            empty_name = sum(1 for r in rows if not str(r.get("name", "")).strip())
            empty_type = sum(1 for r in rows if not str(r.get("type", "")).strip())
            if empty_name:
                warnings.append(f"Пустое поле name у {empty_name} строк")
            if empty_type:
                warnings.append(f"Пустое поле type у {empty_type} строк")

        # Уровни 2-4: координаты
        if level in (2, 3, 4):
            bad_coords = 0
            for r in rows:
                try:
                    lat, lon = float(r["lat"]), float(r["lon"])
                    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                        bad_coords += 1
                except (KeyError, TypeError, ValueError):
                    bad_coords += 1
            if bad_coords:
                messages.append(f"Некорректных координат: {bad_coords}")

        # Доп. файлы
        if level == 3:
            routes = os.path.join(work_dir, "output_level3_routes.csv")
            stats["has_routes"] = os.path.isfile(routes)
            if not stats["has_routes"]:
                warnings.append("Нет output_level3_routes.csv (диспетчерская задача)")
        if level == 4:
            spoof = os.path.join(work_dir, "output_level4_spoof_zone.json")
            stats["has_spoof_zone"] = os.path.isfile(spoof)
            if not stats["has_spoof_zone"]:
                warnings.append("Нет output_level4_spoof_zone.json (зона спуфинга)")
            if stats["has_spoof_zone"]:
                try:
                    with open(spoof, "r", encoding="utf-8") as f:
                        zone = json.load(f)
                    for k in ("center_lat", "center_lon", "radius_nm"):
                        if k not in zone:
                            warnings.append(f"В spoof_zone.json нет поля {k}")
                except json.JSONDecodeError:
                    messages.append("output_level4_spoof_zone.json — невалидный JSON")

        viz = os.path.join(work_dir, "visualization.html")
        stats["has_visualization"] = os.path.isfile(viz)
        if level in (2, 4) and not stats["has_visualization"]:
            warnings.append("Нет visualization.html (карта обязательна для уровня)")

        ok = len([m for m in messages if "Отсутствуют" in m or "пустой" in m or "Некорректных" in m]) == 0
        if ok and not messages:
            messages.append(
                f"Формат ответа корректен: {len(rows)} строк, MMSI={len(mmsi_set)}."
            )
            messages.append(f"Задача уровня {level}: {hints.get('desc', '')}")
            if warnings:
                messages.append("Есть замечания — см. ниже. Точная оценка только у проверяющего.")

        return {"ok": ok, "messages": messages, "warnings": warnings, "stats": stats}

    except Exception as exc:
        return {"ok": False, "messages": [str(exc)], "warnings": warnings, "stats": stats}
