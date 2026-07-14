#!/usr/bin/env python3
"""
Устаревшая точка входа перенаправляет на правильные скрипты.

Участники:     python participant_map.py
Проверяющие:   python judge/ais_map.py
"""
import os
import sys

print("ais_map.py перенесён в judge/ais_map.py (только для проверяющих).")
print("Участникам: python participant_map.py — визуализация только своих данных.")
if "--judge" in sys.argv:
    script = os.path.join(os.path.dirname(__file__), "judge", "ais_map.py")
    os.execv(sys.executable, [sys.executable, script] + [a for a in sys.argv[1:] if a != "--judge"])
else:
    script = os.path.join(os.path.dirname(__file__), "participant_map.py")
    os.execv(sys.executable, [sys.executable, script] + sys.argv[1:])
