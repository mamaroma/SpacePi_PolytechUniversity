#!/usr/bin/env python3
"""
main.py — инструмент участника (шаги 1–3).

Шаг 1: генерация input_levelX.csv (без эталона)
Шаг 2: декодирование через participant_decoder.py → output_levelX.csv
Шаг 3: карта через participant_map.py

Командная строка (рекомендуется на macOS/Linux):
  python main.py --level 2 --step generate
  python main.py --level 2 --step decode
  python main.py --level 2 --step map

Окно (GUI): те же шаги кнопками.
"""
from __future__ import annotations

import argparse
import csv
import datetime
import importlib.util
import os
import subprocess
import sys
import threading
from pathlib import Path

from ais_engine import AISSimulator, LEVEL_COUNTS, universal_decoder

BASE_DIR = Path(__file__).resolve().parent
GENERATED_GLOBS = [
    "input_level*.csv",
    "output_level*.csv",
    "reference_level*.csv",
    "participant_output.csv",
    "*.map.html",
]

LEVEL_HINTS = {
    1: "Ожидается около 5 валидных MMSI после фильтрации.",
    2: "Ожидается около 34 точек трека одного MMSI.",
    3: "Ожидается 13 судов (7 у Атлантики + 6 у Тихого океана).",
    4: "Ожидается 60 точек (4 судна × 15 шагов), параллельные коридоры.",
}


def cleanup_generated():
    removed = []
    for pattern in GENERATED_GLOBS:
        for p in BASE_DIR.glob(pattern):
            try:
                p.unlink()
                removed.append(p.name)
            except Exception:
                pass
    return removed


def input_path(level: int) -> Path:
    return BASE_DIR / f"input_level{level}.csv"


def output_path(level: int) -> Path:
    return BASE_DIR / f"output_level{level}.csv"


def decoder_path() -> Path:
    return BASE_DIR / "participant_decoder.py"


def map_path() -> Path:
    return BASE_DIR / "participant_map.py"


def step_generate(level: int) -> list[str]:
    logs = []
    cleanup_generated()
    logs.append("Очищены старые input/output/reference файлы.")

    sim = AISSimulator(level=level, num_packets=LEVEL_COUNTS[level])
    packets = sim.generate_packets(count_packets=LEVEL_COUNTS[level])

    in_file = input_path(level)
    with in_file.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["timestamp", "ais_sentence"])
        writer.writerows(packets)

    broken = sum(1 for _, pkt in packets if pkt.startswith("!AIVDM") is False or "ERROR" in pkt or "!" in pkt[7:20])
    logs.append(f"Шаг 1 выполнен: создан {in_file.name}")
    logs.append(f"Пакетов: {len(packets)} (повреждённых/ошибочных: {broken})")
    logs.append(LEVEL_HINTS[level])
    logs.append("Эталон участнику НЕ выдаётся. Проверка — у организатора.")
    return logs


def load_decoder():
    path = decoder_path()
    if not path.exists():
        return None, None
    spec = importlib.util.spec_from_file_location("participant_decoder", str(path))
    if spec is None or spec.loader is None:
        return None, None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    fn = getattr(module, "decode_packets", None)
    return fn if callable(fn) else None, path


def step_decode(level: int) -> list[str]:
    logs = []
    in_file = input_path(level)
    if not in_file.exists():
        raise FileNotFoundError(f"Сначала выполните шаг 1 (нет {in_file.name})")

    with in_file.open("r", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    decoder_fn, dec_path = load_decoder()
    if decoder_fn:
        logs.append(f"Используется декодер: {dec_path.name}")
        result = decoder_fn(rows)
        if not isinstance(result, list):
            raise ValueError("participant_decoder.decode_packets() должен вернуть list[dict]")
    else:
        logs.append("participant_decoder.py не найден — используется базовый декодер.")
        result = []
        for row in rows:
            res = universal_decoder(row.get("ais_sentence", ""))
            if res:
                res["last_seen"] = row.get("timestamp", "")
                result.append(res)

    out_file = output_path(level)
    if result:
        keys = sorted({k for row in result for k in row.keys()})
        with out_file.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=keys)
            w.writeheader()
            w.writerows(result)
    else:
        out_file.write_text("mmsi\n", encoding="utf-8")

    valid_lines = len(result)
    unique_mmsi = len({str(r.get("mmsi")) for r in result if r.get("mmsi")})
    logs.append("Шаг 2: декодирование завершено.")
    logs.append(f"Прочитано строк входа: {len(rows)}")
    logs.append(f"Успешно декодировано: {valid_lines}")
    logs.append(f"Уникальных MMSI в ответе: {unique_mmsi}")
    logs.append(f"Результат сохранён: {out_file.name}")
    logs.append(LEVEL_HINTS[level])
    logs.append(
        "Участник не видит эталон. Корректность оценивает проверяющий "
        "или портал (сравнение с закрытым reference)."
    )
    return logs


def step_map(level: int) -> list[str]:
    logs = []
    out_file = output_path(level)
    if not out_file.exists():
        raise FileNotFoundError(f"Сначала выполните шаг 2 (нет {out_file.name})")

    mp = map_path()
    if not mp.exists():
        raise FileNotFoundError(
            "Создайте participant_map.py: скопируйте participant_map_template.py → participant_map.py"
        )

    cmd = [sys.executable, str(mp), "--csv", str(out_file)]
    logs.append(f"Запуск карты: {' '.join(cmd)}")
    subprocess.run(cmd, cwd=str(BASE_DIR), check=True)
    logs.append("Шаг 3: карта открыта в браузере (HTML рядом с CSV).")
    return logs


# ─── GUI ───────────────────────────────────────────────────────────────────
try:
    import tkinter as tk
    from tkinter import ttk, scrolledtext, messagebox
except Exception:
    tk = None


class AISParticipantApp:
    def __init__(self, root):
        self.root = root
        self.root.title("AIS — инструмент участника")
        self.root.geometry("720x580")
        self.status_var = tk.StringVar(value="Готов")
        self.level_var = tk.StringVar(value="1")
        self._build()

    def _build(self):
        frame = ttk.Frame(self.root, padding=12)
        frame.pack(fill=tk.BOTH, expand=True)

        row = ttk.Frame(frame)
        row.pack(fill=tk.X)
        ttk.Label(row, text="Уровень:").pack(side=tk.LEFT)
        ttk.Combobox(row, textvariable=self.level_var, values=["1", "2", "3", "4"], width=4, state="readonly").pack(side=tk.LEFT, padx=6)

        btns = ttk.Frame(frame)
        btns.pack(fill=tk.X, pady=10)
        ttk.Button(btns, text="Шаг 1 — сгенерировать input", command=lambda: self._run(step_generate)).pack(side=tk.LEFT, padx=4)
        ttk.Button(btns, text="Шаг 2 — декодировать", command=lambda: self._run(step_decode)).pack(side=tk.LEFT, padx=4)
        ttk.Button(btns, text="Шаг 3 — карта", command=lambda: self._run(step_map)).pack(side=tk.LEFT, padx=4)

        self.log_area = scrolledtext.ScrolledText(frame, height=22, state="disabled", bg="#f7f7f7")
        self.log_area.pack(fill=tk.BOTH, expand=True)
        ttk.Label(frame, textvariable=self.status_var, relief=tk.SUNKEN, anchor=tk.W).pack(fill=tk.X, pady=(8, 0))

        self._log("Рабочая папка: " + str(BASE_DIR))
        self._log("Файлы участника: participant_decoder.py, participant_map.py, output_levelX.csv")

    def _log(self, text):
        self.log_area.configure(state="normal")
        self.log_area.insert(tk.END, f"[{datetime.datetime.now().strftime('%H:%M:%S')}] {text}\n")
        self.log_area.see(tk.END)
        self.log_area.configure(state="disabled")

    def _run(self, fn):
        level = int(self.level_var.get())
        self.status_var.set("Выполнение...")
        def worker():
            try:
                for line in fn(level):
                    self.root.after(0, lambda l=line: self._log(l))
                self.root.after(0, lambda: self.status_var.set("Готово"))
            except Exception as e:
                self.root.after(0, lambda: messagebox.showerror("Ошибка", str(e)))
                self.root.after(0, lambda: self.status_var.set("Ошибка"))
        threading.Thread(target=worker, daemon=True).start()


def main():
    parser = argparse.ArgumentParser(description="AIS participant tool")
    parser.add_argument("--level", type=int, choices=[1, 2, 3, 4], default=1)
    parser.add_argument("--step", choices=["generate", "decode", "map"], help="CLI шаг")
    args = parser.parse_args()

    if args.step:
        os.chdir(BASE_DIR)
        fn = {"generate": step_generate, "decode": step_decode, "map": step_map}[args.step]
        for line in fn(args.level):
            print(line)
        return

    if tk is None:
        raise SystemExit("tkinter недоступен. Используйте --step generate|decode|map")
    root = tk.Tk()
    AISParticipantApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
