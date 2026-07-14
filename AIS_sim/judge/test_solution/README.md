# Тестовое решение (только для проверяющих)

> **Не включать в `AIS_participant.zip` и не выдавать участникам.**

Этот каталог нужен организатору, чтобы пройти **полный путь участника** и проверить приём работ.

## Быстрый автотест (рекомендуется)

Из корня проекта:

```bash
python3 judge/run_test_path.py --level 2
python3 judge/run_test_path.py --level 4
```

Скрипт выполняет:

1. Шаг 1 — `main.py --level N` (генерация `input_levelN.csv`)
2. Шаг 2 — запись эталонного ответа из `sealed_blob` (режим `reference`) или `solver.py`
3. Шаг 3 — карта `visualization.html`
4. Шаг 4 — сборка `AIS_sim/submission.aispkg`
5. Проверка — `judge/ais_judge.py` с выводом баллов

## Ручной прогон (как у участника)

```bash
# Шаг 1
python3 main.py --level 2

# Шаг 2 — тестовый декодер (скопировать в корень)
cp judge/test_solution/decoder.py decoder.py
cp judge/test_solution/map.py map.py
python3 run_decoder.py
python3 judge/test_solution/solver.py --level 2

# Шаг 3
python3 participant_map.py --csv AIS_sim/output_level2.csv

# Шаг 4 — в GUI main.py или:
python3 -c "
from ais_core.sealed import create_submission_package
create_submission_package('AIS_sim', participant_name='TEST')
"

# Проверка
python3 judge/ais_judge.py AIS_sim/submission.aispkg --json-out /tmp/test_report.json
```

## Файлы

| Файл | Назначение |
|------|------------|
| `decoder.py` | Пример реализации `decode_ais()` |
| `map.py` | Пример `visualize()` |
| `solver.py` | Постобработка по уровням (фильтры, routes, spoof zone) |

## Что сдавать на портал

Участник загружает **только** `AIS_sim/submission.aispkg`, не весь проект и не `judge/`.
