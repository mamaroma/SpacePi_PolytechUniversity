# AIS Simulator — отборочный этап

## Участнику

| Документ | Назначение |
|----------|------------|
| **[UCHASTNIK.md](UCHASTNIK.md)** | Пошаговая инструкция (читать первым) |
| **[ZADANIE.md](ZADANIE.md)** | Постановка задачи и баллы |

## Быстрый старт

```bash
python3 main.py --level 2          # Шаг 1
python3 my_solver.py               # Шаг 2 — ВАШ код
python3 participant_map.py --csv AIS_sim/output_level2.csv   # Шаг 3
python3 main.py                    # Шаг 4 → submission.aispkg
```

На портал: **только** `AIS_sim/submission.aispkg`

## Проверяющему

Инструкция в `judge/JUDGE.md` (не выдавать участникам).

```bash
python3 pack_participant.py        # собрать архив для участников
python3 judge/ais_judge.py AIS_sim/submission.aispkg
```
