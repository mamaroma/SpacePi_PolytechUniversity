#!/usr/bin/env python3
"""
Визуализация только данных участника (без эталона).
Работает из коробки: stdlib + HTML/Leaflet, без PyQt.
"""
import csv
import json
import os
import sys
import webbrowser

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
WORK_DIR = os.path.join(PROJECT_ROOT, "AIS_sim")

# Цвета по MMSI (до 8 судов)
MMSI_COLORS = [
    "#e74c3c", "#3498db", "#2ecc71", "#f39c12",
    "#9b59b6", "#1abc9c", "#e67e22", "#34495e",
]


def load_geo_rows(path):
    rows = []
    with open(path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if "lat" not in row or "lon" not in row:
                continue
            try:
                lat = float(row["lat"])
                lon = float(row["lon"])
            except (TypeError, ValueError):
                continue
            if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                continue
            rows.append({
                "mmsi": str(row.get("mmsi", "?")),
                "lat": lat,
                "lon": lon,
                "speed": row.get("speed", "?"),
                "last_seen": row.get("last_seen", ""),
            })
    return rows


def _color_for_mmsi(mmsi, palette):
    if mmsi not in palette:
        palette[mmsi] = MMSI_COLORS[len(palette) % len(MMSI_COLORS)]
    return palette[mmsi]


def build_leaflet_html(rows, title="AIS — данные участника"):
    if not rows:
        raise ValueError("Нет точек для карты")

    center_lat = sum(r["lat"] for r in rows) / len(rows)
    center_lon = sum(r["lon"] for r in rows) / len(rows)
    palette = {}
    js_lines = []

    # Группировка по MMSI для линий трека
    by_mmsi = {}
    for r in rows:
        by_mmsi.setdefault(r["mmsi"], []).append(r)

    for mmsi, track in by_mmsi.items():
        color = _color_for_mmsi(mmsi, palette)
        if len(track) > 1:
            track.sort(key=lambda x: x.get("last_seen", ""))
            coords = json.dumps([[p["lat"], p["lon"]] for p in track])
            js_lines.append(
                f"L.polyline({coords}, {{color: '{color}', weight: 3, opacity: 0.8}})"
                f".addTo(map).bindPopup('MMSI {mmsi} — трек ({len(track)} точек)');"
            )
        for p in track:
            popup = f"MMSI: {mmsi}<br>Speed: {p['speed']}<br>Time: {p.get('last_seen', '')}"
            js_lines.append(
                f"L.circleMarker([{p['lat']}, {p['lon']}], "
                f"{{radius: 7, color: '{color}', fillColor: '{color}', fillOpacity: 0.85}})"
                f".addTo(map).bindPopup({json.dumps(popup)});"
            )

    legend_items = "".join(
        f"<div><span style='color:{c}'>●</span> MMSI {m}</div>"
        for m, c in palette.items()
    )

    return f"""<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/>
<title>{title}</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
html,body,#map{{height:100%;margin:0}}
#legend{{position:absolute;bottom:20px;left:10px;z-index:1000;background:#fff;
padding:8px 12px;border-radius:4px;font:13px sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.3)}}
</style>
</head><body>
<div id="map"></div>
<div id="legend"><b>Суда</b>{legend_items}</div>
<script>
var map = L.map('map').setView([{center_lat}, {center_lon}], 7);
L.tileLayer('https://{{s}}.tile.openstreetmap.org/{{z}}/{{x}}/{{y}}.png', {{
  maxZoom: 18, attribution: '&copy; OpenStreetMap'
}}).addTo(map);
{chr(10).join(js_lines)}
</script>
</body></html>"""


def try_custom_map(input_csv, output_csv, html_path, project_root=None):
    try:
        from ais_core.plugins import run_custom_visualization
        root = project_root or os.path.dirname(os.path.dirname(output_csv))
        result, path = run_custom_visualization(
            input_csv, output_csv, output_html=html_path, work_dir=root
        )
        if path:
            return result or html_path, path
    except Exception:
        pass
    return None, None


def render_map_to_html(csv_path, html_path=None, project_root=None):
    """
    Строит карту и возвращает (html_path, message).
    Вызывается из CLI и из main.py.
    """
    project_root = project_root or PROJECT_ROOT
    if not os.path.isfile(csv_path):
        raise FileNotFoundError(f"CSV не найден: {csv_path}")

    rows = load_geo_rows(csv_path)
    if not rows:
        raise ValueError("В файле нет валидных координат lat/lon")

    out_dir = os.path.dirname(csv_path) or WORK_DIR
    html_path = html_path or os.path.join(out_dir, "visualization.html")

    manifest_input = None
    try:
        from ais_core.sealed import load_manifest
        manifest = load_manifest(out_dir)
        manifest_input = os.path.join(out_dir, manifest["input_file"])
    except Exception:
        pass

    custom_html, custom_path = try_custom_map(
        manifest_input or csv_path, csv_path, html_path, project_root=project_root
    )
    if custom_html and os.path.isfile(custom_html):
        return custom_html, f"Карта построена через map.py ({custom_path})"

    html = build_leaflet_html(rows)
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html)

    mmsi_count = len({r["mmsi"] for r in rows})
    return html_path, f"Карта: {len(rows)} точек, {mmsi_count} судов → {html_path}"


def open_map_in_browser(html_path):
    url = f"file://{os.path.abspath(html_path)}"
    webbrowser.open(url)
    return url


# --- GUI (опционально) ---

def _run_gui():
    from tkinter import filedialog, messagebox
    import tkinter as tk
    from tkinter import ttk
    from ais_core.sealed import load_manifest, participant_output_path
    from ais_core.gui_utils import bring_tk_window_to_front, startup_message

    class ParticipantMapApp:
        def __init__(self, root):
            self.root = root
            self.root.title("AIS — визуализация участника")
            self.root.geometry("560x220")
            self.csv_path = tk.StringVar()
            self._prefill_default()
            ttk.Label(root, text="CSV с вашим декодированием:").pack(anchor=tk.W, padx=12, pady=(12, 4))
            row = ttk.Frame(root)
            row.pack(fill=tk.X, padx=12)
            ttk.Entry(row, textvariable=self.csv_path).pack(side=tk.LEFT, fill=tk.X, expand=True)
            ttk.Button(row, text="Обзор...", command=self.browse).pack(side=tk.LEFT, padx=6)
            ttk.Button(root, text="Построить карту", command=self.render).pack(pady=12)
            self.status = ttk.Label(root, text="")
            self.status.pack(anchor=tk.W, padx=12)

        def _prefill_default(self):
            try:
                manifest = load_manifest(WORK_DIR)
                default_out = participant_output_path(WORK_DIR, manifest["level"])
                if os.path.isfile(default_out):
                    self.csv_path.set(default_out)
            except Exception:
                pass

        def browse(self):
            path = filedialog.askopenfilename(filetypes=[("CSV", "*.csv")])
            if path:
                self.csv_path.set(path)

        def render(self):
            path = self.csv_path.get().strip()
            try:
                html_path, msg = render_map_to_html(path)
                open_map_in_browser(html_path)
                self.status.config(text=msg)
            except Exception as exc:
                messagebox.showerror("Ошибка", str(exc))

    startup_message("Карта участника: выберите CSV → «Построить карту»")
    root = tk.Tk()
    ParticipantMapApp(root)
    bring_tk_window_to_front(root)
    root.mainloop()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Визуализация AIS — данные участника")
    parser.add_argument("--csv", help="Путь к output_levelN.csv")
    parser.add_argument("--gui", action="store_true", help="Открыть окно")
    args = parser.parse_args()

    if args.csv and not args.gui:
        html_path, msg = render_map_to_html(args.csv)
        url = open_map_in_browser(html_path)
        print(msg, flush=True)
        print(f"URL: {url}", flush=True)
    else:
        _run_gui()
