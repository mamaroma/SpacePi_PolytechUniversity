"""
ais_map.py — инструмент ПРОВЕРЯЮЩЕГО (не выдавать участнику).

Требует: pip install PyQt5 PyQtWebEngine plotly

Запуск:
  cd AIS_sim
  python judge/ais_map.py
"""
import sys
import csv
import tempfile
import os
from PyQt5.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout,
                             QHBoxLayout, QLabel, QPushButton, QFileDialog,
                             QCheckBox, QGroupBox, QTextEdit, QMessageBox)
from PyQt5.QtCore import QUrl
from PyQt5.QtWebEngineWidgets import QWebEngineView
import plotly.graph_objects as go


class AISMapQt(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("AIS — карта проверяющего (эталон vs участник)")
        self.setGeometry(100, 100, 1200, 800)
        self.ref_path = None
        self.user_path = None
        self.html_file = None
        self.init_ui()

    def init_ui(self):
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        main_layout = QVBoxLayout(central_widget)
        control_panel = QGroupBox("Управление")
        control_layout = QVBoxLayout()
        file_layout = QHBoxLayout()
        self.ref_btn = QPushButton("Выбрать эталонный CSV")
        self.ref_btn.clicked.connect(self.select_ref)
        self.ref_label = QLabel("Не выбран")
        self.user_btn = QPushButton("Выбрать CSV участника")
        self.user_btn.clicked.connect(self.select_user)
        self.user_label = QLabel("Не выбран")
        file_layout.addWidget(self.ref_btn)
        file_layout.addWidget(self.ref_label)
        file_layout.addWidget(self.user_btn)
        file_layout.addWidget(self.user_label)
        control_layout.addLayout(file_layout)
        options_layout = QHBoxLayout()
        self.show_ref_cb = QCheckBox("Показывать эталон (зелёный)")
        self.show_ref_cb.setChecked(True)
        self.show_user_cb = QCheckBox("Показывать участника (красный)")
        self.show_user_cb.setChecked(True)
        self.show_diff_cb = QCheckBox("Только различия")
        self.show_diff_cb.setChecked(False)
        options_layout.addWidget(self.show_ref_cb)
        options_layout.addWidget(self.show_user_cb)
        options_layout.addWidget(self.show_diff_cb)
        control_layout.addLayout(options_layout)
        self.generate_btn = QPushButton("Построить карту")
        self.generate_btn.clicked.connect(self.generate_map)
        control_layout.addWidget(self.generate_btn)
        control_panel.setLayout(control_layout)
        main_layout.addWidget(control_panel)
        self.web_view = QWebEngineView()
        main_layout.addWidget(self.web_view, stretch=2)
        self.log_text = QTextEdit()
        self.log_text.setReadOnly(True)
        self.log_text.setMaximumHeight(150)
        main_layout.addWidget(self.log_text)

    def select_ref(self):
        path, _ = QFileDialog.getOpenFileName(self, "Выберите эталонный CSV", "", "CSV files (*.csv)")
        if path:
            self.ref_path = path
            self.ref_label.setText(os.path.basename(path))
            self.log(f"Выбран эталон: {path}")

    def select_user(self):
        path, _ = QFileDialog.getOpenFileName(self, "Выберите CSV участника", "", "CSV files (*.csv)")
        if path:
            self.user_path = path
            self.user_label.setText(os.path.basename(path))
            self.log(f"Выбран результат участника: {path}")

    def log(self, msg):
        self.log_text.append(msg)
        QApplication.processEvents()

    def load_csv_data(self, path):
        data = []
        try:
            with open(path, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    if "lat" in row and "lon" in row:
                        try:
                            lat = float(row["lat"])
                            lon = float(row["lon"])
                            if -90 <= lat <= 90 and -180 <= lon <= 180:
                                data.append({
                                    "mmsi": row.get("mmsi", "?"),
                                    "lat": lat,
                                    "lon": lon,
                                    "speed": row.get("speed", "?"),
                                    "course": row.get("course", "?"),
                                })
                        except Exception:
                            continue
        except Exception as e:
            self.log(f"Ошибка загрузки {path}: {e}")
        return data

    def generate_map(self):
        if not self.ref_path and not self.user_path:
            QMessageBox.warning(self, "Ошибка", "Выберите хотя бы один файл")
            return
        ref_data = self.load_csv_data(self.ref_path) if self.ref_path else []
        user_data = self.load_csv_data(self.user_path) if self.user_path else []
        if not ref_data and not user_data:
            QMessageBox.warning(self, "Ошибка", "Нет данных с координатами")
            return
        show_ref = self.show_ref_cb.isChecked() and ref_data
        show_user = self.show_user_cb.isChecked() and user_data
        show_diff = self.show_diff_cb.isChecked()
        lats, lons, colors, texts, sizes = [], [], [], [], []
        if show_diff and ref_data and user_data:
            ref_mmsi_set = {d["mmsi"] for d in ref_data}
            user_mmsi_set = {d["mmsi"] for d in user_data}
            only_ref = [d for d in ref_data if d["mmsi"] not in user_mmsi_set]
            only_user = [d for d in user_data if d["mmsi"] not in ref_mmsi_set]
            for d in only_ref:
                lats.append(d["lat"]); lons.append(d["lon"]); colors.append("green")
                texts.append(f"Только эталон<br>MMSI: {d['mmsi']}")
                sizes.append(12)
            for d in only_user:
                lats.append(d["lat"]); lons.append(d["lon"]); colors.append("red")
                texts.append(f"Только участник<br>MMSI: {d['mmsi']}")
                sizes.append(12)
        else:
            if show_ref:
                for d in ref_data:
                    lats.append(d["lat"]); lons.append(d["lon"]); colors.append("green")
                    texts.append(f"Эталон<br>MMSI: {d['mmsi']}")
                    sizes.append(10)
            if show_user:
                for d in user_data:
                    lats.append(d["lat"]); lons.append(d["lon"]); colors.append("red")
                    texts.append(f"Участник<br>MMSI: {d['mmsi']}")
                    sizes.append(10)
        fig = go.Figure()
        fig.add_trace(go.Scattermapbox(
            lat=lats, lon=lons, mode="markers",
            marker=dict(size=sizes, color=colors, opacity=0.8),
            text=texts, hoverinfo="text",
        ))
        fig.update_layout(
            mapbox=dict(style="carto-positron", center=dict(lat=sum(lats)/len(lats), lon=sum(lons)/len(lons)), zoom=5),
            margin=dict(l=0, r=0, t=30, b=0),
            title="Зелёный — эталон, красный — участник",
        )
        if self.html_file:
            try:
                os.unlink(self.html_file.name)
            except Exception:
                pass
        self.html_file = tempfile.NamedTemporaryFile(suffix=".html", delete=False)
        fig.write_html(self.html_file.name)
        self.web_view.load(QUrl.fromLocalFile(self.html_file.name))


if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = AISMapQt()
    window.show()
    sys.exit(app.exec_())
