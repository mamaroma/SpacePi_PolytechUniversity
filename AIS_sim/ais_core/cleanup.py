"""Очистка рабочих файлов уровня перед новой генерацией."""
import glob
import os


def clean_level_workdir(work_dir, level):
    """Удаляет старые output и артефакты уровня (не трогает input других уровней)."""
    os.makedirs(work_dir, exist_ok=True)
    to_remove = [
        f"output_level{level}.csv",
        "visualization.html",
        "submission.aispkg",
    ]
    if level == 3:
        to_remove.append("output_level3_routes.csv")
    if level == 4:
        to_remove.append("output_level4_spoof_zone.json")

    removed = []
    for name in to_remove:
        path = os.path.join(work_dir, name)
        if os.path.isfile(path):
            os.remove(path)
            removed.append(name)

    # Старые input/output других уровней не удаляем — только текущий output
    return removed
