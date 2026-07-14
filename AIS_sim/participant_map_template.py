#!/usr/bin/env python3
"""
participant_map.py — визуализация ТОЛЬКО данных участника (без эталона).

Скопируйте participant_map_template.py → participant_map.py

Запуск:
  python participant_map.py --csv output_level2.csv
"""
from __future__ import annotations

import argparse
import csv
import json
import webbrowser
from pathlib import Path


def load_points(csv_path: Path) -> list[dict]:
    points = []
    with csv_path.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                lat = float(row.get("lat", ""))
                lon = float(row.get("lon", ""))
            except Exception:
                continue
            if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                continue
            points.append(
                {
                    "mmsi": row.get("mmsi", ""),
                    "lat": lat,
                    "lon": lon,
                    "speed": row.get("speed", ""),
                    "last_seen": row.get("last_seen", ""),
                }
            )
    return points


def build_html(points: list[dict], title: str) -> str:
    center_lat = sum(p["lat"] for p in points) / len(points)
    center_lon = sum(p["lon"] for p in points) / len(points)
    palette = ["#e63946", "#2a9d8f", "#457b9d", "#f4a261", "#9b5de5", "#00bbf9", "#fee440", "#f15bb5"]
    mmsi_list = sorted({str(p["mmsi"]) for p in points})
    color_map = {m: palette[i % len(palette)] for i, m in enumerate(mmsi_list)}
    features = []
    tracks: dict[str, list] = {}
    for p in points:
        key = str(p["mmsi"])
        tracks.setdefault(key, []).append([p["lon"], p["lat"]])
    for mmsi, coords in tracks.items():
        if len(coords) > 1:
            features.append(
                {
                    "type": "Feature",
                    "properties": {"mmsi": mmsi, "color": color_map[mmsi]},
                    "geometry": {"type": "LineString", "coordinates": coords},
                }
            )
    for p in points:
        mmsi = str(p["mmsi"])
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "mmsi": mmsi,
                    "color": color_map[mmsi],
                    "speed": p.get("speed", ""),
                    "last_seen": p.get("last_seen", ""),
                },
                "geometry": {"type": "Point", "coordinates": [p["lon"], p["lat"]]},
            }
        )
    geojson = json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False)
    legend_items = "".join(
        f'<div class="legend-item"><span class="swatch" style="background:{color_map[m]}"></span>MMSI {m}</div>'
        for m in mmsi_list
    )
    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>{title}</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
html,body,#map{{height:100%;margin:0}}
.legend{{position:absolute;bottom:16px;left:16px;z-index:1000;background:#fff;padding:10px 12px;
border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.2);font:13px/1.4 sans-serif;max-height:40vh;overflow:auto}}
.legend-item{{display:flex;align-items:center;gap:8px;margin:4px 0}}
.swatch{{width:14px;height:14px;border-radius:50%;display:inline-block}}
</style></head>
<body><div id="map"></div><div class="legend"><strong>Треки по MMSI</strong>{legend_items}</div><script>
const data = {geojson};
const map = L.map('map').setView([{center_lat}, {center_lon}], 7);
L.tileLayer('https://{{s}}.tile.openstreetmap.org/{{z}}/{{x}}/{{y}}.png').addTo(map);
const layers = L.geoJSON(data, {{
  pointToLayer: (f, latlng) => L.circleMarker(latlng, {{radius:6, color:f.properties.color, fillColor:f.properties.color, fillOpacity:0.85}}),
  onEachFeature: (f, layer) => {{
    const p = f.properties || {{}};
    if (p.mmsi) layer.bindPopup(`MMSI: ${{p.mmsi}}<br>Speed: ${{p.speed||'—'}}<br>Time: ${{p.last_seen||'—'}}`);
  }},
  style: f => f.geometry.type === 'LineString' ? {{color: f.properties.color, weight:3}} : {{}}
}}).addTo(map);
map.fitBounds(layers.getBounds(), {{padding:[30,30]}});
</script></body></html>"""


def main():
    parser = argparse.ArgumentParser(description="Карта ответа участника")
    parser.add_argument("--csv", required=True, help="Путь к output_levelX.csv")
    args = parser.parse_args()

    csv_path = Path(args.csv)
    if not csv_path.exists():
        raise SystemExit(f"Файл не найден: {csv_path}")

    points = load_points(csv_path)
    if not points:
        raise SystemExit("В CSV нет валидных координат lat/lon")

    html_path = csv_path.with_suffix(".map.html")
    html_path.write_text(build_html(points, f"Карта участника — {csv_path.name}"), encoding="utf-8")
    print(f"Карта сохранена: {html_path}")
    print(f"Точек: {len(points)}, MMSI: {len({p['mmsi'] for p in points})}")
    webbrowser.open(html_path.resolve().as_uri())


if __name__ == "__main__":
    main()
