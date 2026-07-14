"""Тестовая карта — только для judge/test_solution/."""
import json
import os

from participant_map import build_leaflet_html, load_geo_rows


def visualize(input_csv, output_csv, output_html=None):
    rows = load_geo_rows(output_csv)
    if not rows:
        raise ValueError("Нет координат в output_csv")

    out = output_html or os.path.join(os.path.dirname(output_csv), "visualization.html")
    html = build_leaflet_html(rows, title="AIS — тестовое решение")
    with open(out, "w", encoding="utf-8") as f:
        f.write(html)
    return out
