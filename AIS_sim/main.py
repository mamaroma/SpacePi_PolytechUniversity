import csv
import os
import secrets
import threading
import webbrowser
import tkinter as tk
from tkinter import messagebox, scrolledtext, ttk

from ais_core.cleanup import clean_level_workdir
from ais_core.reference import build_reference
from ais_core.sealed import (
    create_run_package,
    create_submission_package,
    load_manifest,
    participant_output_path,
)
from ais_core.simulator import AISSimulator, count_packet_issues, packet_count_for_level
from ais_core.validation import validate_output
from ais_core.gui_utils import bring_tk_window_to_front, startup_message

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
WORK_DIR = os.path.join(PROJECT_ROOT, "AIS_sim")


class AISParticipantApp:
    def __init__(self, root):
        self.root = root
        self.root.title("AIS Simulator — участник")
        self.root.geometry("720x640")
        self.status_var = tk.StringVar(value="Готов")
        self.init_ui()

    def init_ui(self):
        main_frame = ttk.Frame(self.root, padding="15")
        main_frame.pack(fill=tk.BOTH, expand=True)

        ttk.Label(
            main_frame,
            text="Инструкция: UCHASTNIK.md",
            font=("", 10, "bold"),
        ).pack(anchor=tk.W, pady=(0, 8))

        # --- Шаг 1 ---
        s1 = ttk.LabelFrame(main_frame, text=" Шаг 1. Генерация входных пакетов (здесь, в main.py) ", padding="10")
        s1.pack(fill=tk.X, pady=4)
        ttk.Label(s1, text="Уровень:").grid(row=0, column=0, sticky=tk.W)
        self.level_combo = ttk.Combobox(s1, values=["1", "2", "3", "4"], width=5, state="readonly")
        self.level_combo.current(0)
        self.level_combo.grid(row=0, column=1, padx=5)
        self.gen_btn = ttk.Button(s1, text="Сгенерировать input_levelN.csv", command=self.start_generation)
        self.gen_btn.grid(row=0, column=2, padx=8)
        ttk.Label(
            s1,
            text="Создаёт AIS_sim/input_levelN.csv. Старый output этого уровня удаляется автоматически.",
            wraplength=650,
        ).grid(row=1, column=0, columnspan=3, sticky=tk.W, pady=(6, 0))

        # --- Шаг 2 ---
        s2 = ttk.LabelFrame(
            main_frame,
            text=" Шаг 2. Декодирование (ВАША программа — НЕ в main.py) ",
            padding="10",
        )
        s2.pack(fill=tk.X, pady=4)
        ttk.Label(
            s2,
            text=(
                "Напишите свой парсер (Python/C++/Java — на выбор).\n"
                "Вход:  AIS_sim/input_levelN.csv\n"
                "Выход: AIS_sim/output_levelN.csv\n"
                "Шаблон декодера (опционально): скопируйте decoder.py.example → decoder.py в КОРЕНЬ проекта"
            ),
            justify=tk.LEFT,
        ).pack(anchor=tk.W)
        ttk.Button(s2, text="Проверить мой output_levelN.csv", command=self.check_output).pack(
            anchor=tk.W, pady=6
        )

        # --- Шаг 3 ---
        s3 = ttk.LabelFrame(main_frame, text=" Шаг 3. Визуализация (ВАША карта) ", padding="10")
        s3.pack(fill=tk.X, pady=4)
        ttk.Label(
            s3,
            text=(
                "Обязательно для уровней 2 и 4.\n"
                "Своя карта: map.py.example → map.py в КОРНЕ проекта (рядом с main.py).\n"
                "Быстрая самопроверка: кнопка ниже (встроенная карта, не зачётная как решение)."
            ),
            justify=tk.LEFT,
        ).pack(anchor=tk.W)
        ttk.Button(s3, text="Построить карту из output_levelN.csv", command=self.build_map).pack(
            anchor=tk.W, pady=6
        )

        # --- Шаг 4 ---
        s4 = ttk.LabelFrame(main_frame, text=" Шаг 4. Отправка на портал ", padding="10")
        s4.pack(fill=tk.X, pady=4)
        ttk.Label(s4, text="Имя участника:").grid(row=0, column=0, sticky=tk.W)
        self.name_entry = ttk.Entry(s4, width=28)
        self.name_entry.grid(row=0, column=1, padx=5)
        ttk.Button(s4, text="Собрать submission.aispkg", command=self.build_submission).grid(
            row=0, column=2, padx=5
        )
        ttk.Label(
            s4,
            text="На портал загружайте ТОЛЬКО файл submission.aispkg (не весь проект).",
            wraplength=650,
        ).grid(row=1, column=0, columnspan=3, sticky=tk.W, pady=(6, 0))

        self.log_area = scrolledtext.ScrolledText(main_frame, height=12, state="disabled", bg="#f8f8f8")
        self.log_area.pack(fill=tk.BOTH, expand=True, pady=8)
        ttk.Label(main_frame, textvariable=self.status_var, relief=tk.SUNKEN, anchor=tk.W).pack(fill=tk.X)

    def log(self, text):
        self.log_area.configure(state="normal")
        self.log_area.insert(tk.END, f"{text}\n")
        self.log_area.see(tk.END)
        self.log_area.configure(state="disabled")

    def start_generation(self):
        try:
            level = int(self.level_combo.get())
            count = packet_count_for_level(level)
            self.gen_btn.config(state=tk.DISABLED)
            threading.Thread(target=self._generate, args=(level, count), daemon=True).start()
        except Exception as exc:
            self.gen_btn.config(state=tk.NORMAL)
            messagebox.showerror("Ошибка", str(exc))

    def _generate(self, level, count):
        try:
            removed = clean_level_workdir(WORK_DIR, level)
            if removed:
                self.log(f"Удалены старые файлы уровня {level}: {', '.join(removed)}")

            os.makedirs(WORK_DIR, exist_ok=True)
            self.status_var.set("Генерация...")
            seed = secrets.randbits(63)
            sim = AISSimulator(level=level, num_packets=count, seed=seed)
            packets = sim.generate_packets(count_packets=count)
            reference = build_reference(packets, level, ships_data=sim.ships_data)
            stats = count_packet_issues(packets, level)

            info = create_run_package(WORK_DIR, level, seed, packets, reference)

            self.log(f"=== Шаг 1 готов: уровень {level} ===")
            self.log(f"Вход:  {info['input_path']}")
            self.log(f"Пакетов: {stats['total']}, с нарушением синтаксиса: ~{stats['syntax_broken']}")

            if level == 1:
                bad_ships = sum(
                    1 for s in sim.ships_data
                    if s["lat"] > 90 or s["lon"] > 180 or s["speed"] < 0
                )
                self.log(f"Судов с заведомо плохими координатами в генераторе: {bad_ships} из {len(sim.ships_data)}")

            self.log(f"Run ID: {info['run_id']}")
            self.log("→ Теперь Шаг 2: запустите СВОЙ парсер, сохраните output_level{}.csv".format(level))
            self.status_var.set("Шаг 1 готов")
        except Exception as exc:
            self.log(f"Ошибка: {exc}")
            self.status_var.set("Ошибка")
        finally:
            self.gen_btn.config(state=tk.NORMAL)

    def check_output(self):
        try:
            result = validate_output(WORK_DIR)
            for msg in result["messages"]:
                self.log(f"[Проверка] {msg}")
            for warn in result["warnings"]:
                self.log(f"[Замечание] {warn}")

            title = "Проверка ответа"
            if result["ok"] and not result["warnings"]:
                messagebox.showinfo(title, "\n".join(result["messages"]))
            elif result["ok"]:
                messagebox.showwarning(title, "\n".join(result["messages"] + result["warnings"]))
            else:
                messagebox.showerror(title, "\n".join(result["messages"] + result["warnings"]))
        except Exception as exc:
            messagebox.showerror("Ошибка", str(exc))

    def build_map(self):
        try:
            manifest = load_manifest(WORK_DIR)
            csv_path = participant_output_path(WORK_DIR, manifest["level"])
            if not os.path.isfile(csv_path):
                messagebox.showwarning(
                    "Нет данных",
                    f"Сначала выполните Шаг 2.\nФайл не найден:\n{csv_path}",
                )
                return

            from participant_map import render_map_to_html, open_map_in_browser

            html_path, msg = render_map_to_html(csv_path, project_root=PROJECT_ROOT)
            url = open_map_in_browser(html_path)
            self.log(f"[Карта] {msg}")
            self.log(f"[Карта] Открыто в браузере: {url}")
            messagebox.showinfo("Карта", f"{msg}\n\nОткрыто в браузере.\nЕсли не открылось (macOS): скопируйте путь в браузер:\n{html_path}")
        except Exception as exc:
            messagebox.showerror("Ошибка карты", str(exc))

    def build_submission(self):
        try:
            val = validate_output(WORK_DIR)
            if not val["ok"]:
                if not messagebox.askyesno(
                    "Предупреждение",
                    "Ответ не прошёл базовую проверку.\nВсё равно собрать submission?",
                ):
                    return

            name = self.name_entry.get().strip()
            out_path, meta = create_submission_package(WORK_DIR, participant_name=name)
            plugins = meta["plugins"]
            self.log(f"=== submission собран: {out_path} ===")
            if plugins["custom_decoder"]:
                self.log("Найден decoder.py в корне проекта (+бонус)")
            if plugins["custom_map"]:
                self.log("Найден map.py в корне проекта (+бонус)")
            messagebox.showinfo(
                "Готово",
                f"Файл для портала:\n{out_path}\n\nЗагрузите ТОЛЬКО этот файл.",
            )
        except Exception as exc:
            messagebox.showerror("Ошибка", str(exc))


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="AIS Simulator — участник")
    parser.add_argument("--level", type=int, choices=[1, 2, 3, 4], help="Шаг 1 без GUI")
    parser.add_argument("--gui", action="store_true", help="Открыть окно")
    args = parser.parse_args()

    if args.level and not args.gui:
        level = args.level
        removed = clean_level_workdir(WORK_DIR, level)
        if removed:
            print(f"Удалены: {', '.join(removed)}", flush=True)
        count = packet_count_for_level(level)
        seed = secrets.randbits(63)
        sim = AISSimulator(level=level, num_packets=count, seed=seed)
        packets = sim.generate_packets(count_packets=count)
        reference = build_reference(packets, level, ships_data=sim.ships_data)
        stats = count_packet_issues(packets, level)
        info = create_run_package(WORK_DIR, level, seed, packets, reference)
        print(f"Шаг 1 готов: {info['input_path']}", flush=True)
        print(f"Пакетов: {stats['total']}, синтакс. ошибок: ~{stats['syntax_broken']}", flush=True)
        print(f"Run ID: {info['run_id']}", flush=True)
        print("Шаг 2: ваш парсер → AIS_sim/output_level{}.csv".format(level), flush=True)
    else:
        startup_message("main.py: ищите окно на Dock (macOS) или за другими окнами")
        root = tk.Tk()
        app = AISParticipantApp(root)
        bring_tk_window_to_front(root)
        root.mainloop()
