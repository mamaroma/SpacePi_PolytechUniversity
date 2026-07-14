#!/usr/bin/env python3
"""
Сборка архива для выдачи участникам.
Исключает judge/, примеры AIS_sim/, служебные файлы.

Запуск (организатор):
    python3 pack_participant.py
    python3 pack_participant.py --output AIS_participant.zip
"""
import argparse
import os
import zipfile

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))

# Что входит в архив участника
INCLUDE = [
    "main.py",
    "participant_map.py",
    "run_decoder.py",
    "decoder.py.example",
    "map.py.example",
    "README.md",
    "ZADANIE.md",
    "UCHASTNIK.md",
    "Konkurs.docx",
]

INCLUDE_DIRS = ["ais_core"]

# Никогда не включать
EXCLUDE_DIRS = {"judge", ".idea", "__pycache__", ".git", "AIS_sim"}
EXCLUDE_FILES = {
    "INSTRUCTION.md",
    "CONTEST.md",
    "README.txt",
    "ais_map.py",
    "requirements-judge.txt",
    "pack_participant.py",
    "decoder.py",
    "map.py",
}
EXCLUDE_PREFIXES = ("judge/", "AIS_sim/input_", "AIS_sim/output_", "AIS_sim/submission")


def should_skip(path):
    parts = path.split(os.sep)
    for p in parts:
        if p in EXCLUDE_DIRS:
            return True
    if os.path.basename(path) in EXCLUDE_FILES:
        return True
    if path.endswith(".pyc"):
        return True
    return False


def verify_zip(path):
    """Проверка: в архиве участника нет judge/ и служебных файлов."""
    bad = []
    with zipfile.ZipFile(path, "r") as zf:
        for name in zf.namelist():
            if name.startswith("judge/") or "/judge/" in name:
                bad.append(name)
            base = os.path.basename(name)
            if base in ("crypto.py", "ais_judge.py", "run_test_path.py"):
                bad.append(name)
            if "test_solution" in name:
                bad.append(name)
    return bad


def pack(output_path):
    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name in INCLUDE:
            full = os.path.join(PROJECT_ROOT, name)
            if os.path.isfile(full):
                zf.write(full, name)

        for dirname in INCLUDE_DIRS:
            dirpath = os.path.join(PROJECT_ROOT, dirname)
            if not os.path.isdir(dirpath):
                continue
            for root, dirs, files in os.walk(dirpath):
                dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
                for f in files:
                    full = os.path.join(root, f)
                    rel = os.path.relpath(full, PROJECT_ROOT)
                    if should_skip(rel):
                        continue
                    zf.write(full, rel)

        # Пустая рабочая папка с пояснением
        readme_work = (
            "Рабочая папка участника.\n"
            "Создаётся автоматически при Шаге 1 (main.py).\n"
            "Не кладите сюда decoder.py / map.py — они в корне проекта.\n"
        )
        zf.writestr("AIS_sim/README.txt", readme_work)

    return output_path


def main():
    parser = argparse.ArgumentParser(description="Упаковка архива для участников")
    parser.add_argument("--output", default="AIS_participant.zip")
    args = parser.parse_args()
    out = pack(os.path.join(PROJECT_ROOT, args.output))
    print(f"Архив участника: {out}")
    print("НЕ включено: judge/, AIS_sim/*.csv, requirements-judge.txt")
    bad = verify_zip(out)
    if bad:
        print("ОШИБКА: в архиве найдены файлы проверяющего:", bad)
        raise SystemExit(1)
    print("Проверка: judge/ в архиве отсутствует ✓")
    print("Проверяющему выдавать полный репозиторий с judge/")


if __name__ == "__main__":
    main()
