"""
Шаблон простой визуализации данных участника.

Переименуйте файл в map.py и доработайте.
Этот скрипт должен читать только participant_output.csv.
"""

import csv


def load_points(path="participant_output.csv"):
    points = []
    with open(path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                points.append(
                    {
                        "mmsi": row.get("mmsi", ""),
                        "lat": float(row.get("lat", "")),
                        "lon": float(row.get("lon", "")),
                        "speed": row.get("speed", ""),
                    }
                )
            except Exception:
                continue
    return points


if __name__ == "__main__":
    pts = load_points()
    print(f"Точек участника: {len(pts)}")
    for p in pts[:10]:
        print(p)
