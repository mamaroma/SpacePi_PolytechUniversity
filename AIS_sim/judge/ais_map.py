#!/usr/bin/env python3
"""
Визуализация для проверяющих: сравнение эталона и ответа участника.
Требует: pip install PyQt5 PyQtWebEngine plotly
"""
import csv
import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from PyQt5.QtCore import Qt, QUrl
from PyQt5.QtWebEngineWidgets import QWebEngineView
from PyQt5.QtWidgets import (
    QApplication,
    QCheckBox,
    QFileDialog,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)
import plotly.graph_objects as go

from ais_core.sealed import load_manifest, participant_output_path, read_submission_package
from judge.crypto import open_run_blob as open_run_data


class AISJudgeMap(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("AIS Judge — сравнение эталона и участника")
        self.setGeometry(100, 100, 1200, 800)
        self.ref_path = None
        self.user_path = None
        self.html_file = None
        self.init_ui()

    def init_ui(self):
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        main_layout = QVBoxLayout(central_widget)

        control_panel = QGroupBox("Управление (только для проверяющих)")
        control_layout = QVBoxLayout()

        file_layout = QHBoxLayout()
        self.ref_btn = QPushButton("Эталон CSV (или из submission)")
        self.ref_btn.clicked.connect(self.select_ref)
        self.ref_label = QLabel("Не выбран")
        self.user_btn = QPushButton("CSV участника")
        self.user_btn.clicked.connect(self.select_user)
        self.user_label = QLabel("Не выбран")
        self.sub_btn = QPushButton("Загрузить submission.aispkg")
        self.sub_btn.clicked.connect(self.load_submission)
        file_layout.addWidget(self.ref_btn)
        file_layout.addWidget(self.ref_label)
        file_layout.addWidget(self.user_btn)
        file_layout.addWidget(self.user_label)
        file_layout.addWidget(self.sub_btn)
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

    def log(self, msg):
        self.log_text.append(msg)
        QApplication.processEvents()

    def select_ref(self):
        path, _ = QFileDialog.getOpenFileName(self, "Эталонный CSV", "", "CSV (*.csv)")
        if path:
            self.ref_path = path
            self.ref_label.setText(os.path.basename(path))

    def select_user(self):
        path, _ = QFileDialog.getOpenFileName(self, "CSV участника", "", "CSV (*.csv)")
        if path:
            self.user_path = path
            self.user_label.setText(os.path.basename(path))

    def load_submission(self):
        path, _ = QFileDialog.getOpenFileName(self, "submission.aispkg", "", "AIS package (*.aispkg)")
        if not path:
            return
        try:
            meta, files = read_submission_package(path)
            manifest = meta["manifest"]
            reference = open_run_data(manifest["sealed_blob"])[1]
            level = manifest["level"]

            tmp = tempfile.mkdtemp(prefix="ais_judge_")
            ref_path = os.path.join(tmp, f"reference_level{level}.csv")
            fields = reference["fields"]
            with open(ref_path, "w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=fields)
                writer.writeheader()
                writer.writerows(reference["rows"])

            user_name = meta["output_file"]
            user_path = os.path.join(tmp, user_name)
            with open(user_path, "wb") as f:
                f.write(files[user_name])

            self.ref_path = ref_path
            self.user_path = user_path
            self.ref_label.setText(os.path.basename(ref_path))
            self.user_label.setText(os.path.basename(user_path))
            self.log(f"Загружен submission: {meta.get('participant_name')} (уровень {level})")
            self.log(f"Плагины: {meta.get('plugins')}")
        except Exception as exc:
            QMessageBox.critical(self, "Ошибка", str(exc))

    def load_from_workdir(self, work_dir):
        manifest = load_manifest(work_dir)
        level = manifest["level"]
        reference = open_run_data(manifest["sealed_blob"])[1]
        ref_path = os.path.join(work_dir, f"_judge_reference_level{level}.csv")
        with open(ref_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=reference["fields"])
            writer.writeheader()
            writer.writerows(reference["rows"])
        self.ref_path = ref_path
        self.user_path = participant_output_path(work_dir, level)
        self.ref_label.setText(os.path.basename(ref_path))
        self.user_label.setText(os.path.basename(self.user_path))

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
                                data.append(
                                    {
                                        "mmsi": row.get("mmsi", "?"),
                                        "lat": lat,
                                        "lon": lon,
                                        "speed": row.get("speed", "?"),
                                    }
                                )
                        except ValueError:
                            continue
        except Exception as exc:
            self.log(f"Ошибка загрузки {path}: {exc}")
        return data

    def generate_map(self):
        if not self.ref_path and not self.user_path:
            QMessageBox.warning(self, "Ошибка", "Выберите файлы или загрузите submission.aispkg")
            return

        ref_data = self.load_csv_data(self.ref_path) if self.ref_path else []
        user_data = self.load_csv_data(self.user_path) if self.user_path else []

        if not ref_data and not user_data:
            QMessageBox.warning(self, "Ошибка", "Нет координат для отображения")
            return

        show_ref = self.show_ref_cb.isChecked() and ref_data
        show_user = self.show_user_cb.isChecked() and user_data
        show_diff = self.show_diff_cb.isChecked()

        lats, lons, colors, texts, sizes = [], [], [], [], []

        if show_diff and ref_data and user_data:
            ref_mmsi_set = {d["mmsi"] for d in ref_data}
            user_mmsi_set = {d["mmsi"] for d in user_data}
            for d in ref_data:
                if d["mmsi"] not in user_mmsi_set:
                    lats.append(d["lat"])
                    lons.append(d["lon"])
                    colors.append("green")
                    texts.append(f"Только эталон<br>MMSI: {d['mmsi']}")
                    sizes.append(12)
            for d in user_data:
                if d["mmsi"] not in ref_mmsi_set:
                    lats.append(d["lat"])
                    lons.append(d["lon"])
                    colors.append("red")
                    texts.append(f"Только участник<br>MMSI: {d['mmsi']}")
                    sizes.append(12)
        else:
            if show_ref:
                for d in ref_data:
                    lats.append(d["lat"])
                    lons.append(d["lon"])
                    colors.append("green")
                    texts.append(f"Эталон<br>MMSI: {d['mmsi']}")
                    sizes.append(10)
            if show_user:
                for d in user_data:
                    lats.append(d["lat"])
                    lons.append(d["lon"])
                    colors.append("red")
                    texts.append(f"Участник<br>MMSI: {d['mmsi']}")
                    sizes.append(10)

        if not lats:
            QMessageBox.warning(self, "Ошибка", "Нет точек для отображения")
            return

        fig = go.Figure()
        fig.add_trace(
            go.Scattermapbox(
                lat=lats,
                lon=lons,
                mode="markers",
                marker=dict(size=sizes, color=colors, opacity=0.8),
                text=texts,
                hoverinfo="text",
            )
        )
        center_lat = sum(lats) / len(lats)
        center_lon = sum(lons) / len(lons)
        fig.update_layout(
            mapbox=dict(
                style="carto-positron",
                center=dict(lat=center_lat, lon=center_lon),
                zoom=5,
            ),
            margin=dict(l=0, r=0, t=30, b=0),
            title="AIS Judge: зелёный — эталон, красный — участник",
        )

        if self.html_file:
            try:
                os.unlink(self.html_file)
            except OSError:
                pass
        tmp = tempfile.NamedTemporaryFile(suffix=".html", delete=False)
        fig.write_html(tmp.name)
        self.html_file = tmp.name
        self.web_view.load(QUrl.fromLocalFile(self.html_file))

    def closeEvent(self, event):
        if self.html_file and os.path.exists(self.html_file):
            try:
                os.unlink(self.html_file)
            except OSError:
                pass
        event.accept()


if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = AISJudgeMap()
    if len(sys.argv) > 1 and os.path.isdir(sys.argv[1]):
        try:
            window.load_from_workdir(sys.argv[1])
        except Exception as exc:
            window.log(f"Не удалось загрузить workdir: {exc}")
    window.show()
    sys.exit(app.exec_())
