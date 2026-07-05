import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox
import threading
import datetime
import csv
import os

from ais_engine import (
    AISSimulator,
    LEVEL_COUNTS,
    reference_process_level1,
    reference_process_multi_level,
)


class AISCSVApp:
    def __init__(self, root):
        self.root = root
        self.root.title("AIS Simulator 2.6 (Physically Correct)")
        self.root.geometry("650x550")
        self.status_var = tk.StringVar(value="Готов")
        self.init_ui()

    def init_ui(self):
        main_frame = ttk.Frame(self.root, padding="15")
        main_frame.pack(fill=tk.BOTH, expand=True)
        cfg = ttk.LabelFrame(main_frame, text=" Уровень ", padding="10")
        cfg.pack(fill=tk.X, pady=5)

        ttk.Label(cfg, text="Уровень сложности:").grid(row=0, column=0, sticky=tk.W)
        self.level_combo = ttk.Combobox(cfg, values=["1", "2", "3", "4"], width=5, state="readonly")
        self.level_combo.current(0)
        self.level_combo.grid(row=0, column=1, padx=5, sticky=tk.W)

        self.run_btn = ttk.Button(main_frame, text="Сгенерировать сырые и эталон", command=self.start)
        self.run_btn.pack(pady=10)

        self.log_area = scrolledtext.ScrolledText(main_frame, height=15, state="disabled", bg="#f0f0f0")
        self.log_area.pack(fill=tk.BOTH, expand=True)
        ttk.Label(main_frame, textvariable=self.status_var, relief=tk.SUNKEN, anchor=tk.W).pack(
            fill=tk.X, side=tk.BOTTOM, pady=(10, 0)
        )

    def log(self, text):
        self.log_area.configure(state="normal")
        self.log_area.insert(tk.END, f"[{datetime.datetime.now().strftime('%H:%M:%S')}] {text}\n")
        self.log_area.see(tk.END)
        self.log_area.configure(state="disabled")

    def start(self):
        try:
            level = int(self.level_combo.get())
            count = LEVEL_COUNTS[level]
            self.run_btn.config(state=tk.DISABLED)
            threading.Thread(target=self.work, args=(level, count), daemon=True).start()
        except Exception as e:
            self.run_btn.config(state=tk.NORMAL)
            messagebox.showerror("Ошибка", f"Ошибка инициализации: {e}")

    def work(self, level, count):
        try:
            if not os.path.exists("AIS_sim"):
                os.makedirs("AIS_sim")
            self.status_var.set("Генерация")
            sim = AISSimulator(level=level, num_packets=count)
            packets = sim.generate_packets(count_packets=count)

            in_file = f"AIS_sim/input_level{level}.csv"
            with open(in_file, "w", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow(["timestamp", "ais_sentence"])
                writer.writerows(packets)

            self.status_var.set("Декодирование эталона...")
            if level == 1:
                result = reference_process_level1(packets)
                fields = ["mmsi"]
            else:
                result = reference_process_multi_level(packets)
                fields = ["mmsi", "lat", "lon", "speed", "last_seen"]

            ref_file = f"AIS_sim/reference_level{level}.csv"
            with open(ref_file, "w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=fields)
                writer.writeheader()
                writer.writerows(result)

            self.log(f"Уровень {level} успешно сформирован.")
            self.status_var.set("Готово")
        except Exception as e:
            self.log(f"Ошибка выполнения: {e}")
            self.status_var.set("Ошибка")
        finally:
            self.run_btn.config(state=tk.NORMAL)


if __name__ == "__main__":
    root = tk.Tk()
    app = AISCSVApp(root)
    root.mainloop()
