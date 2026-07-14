# Инструкция проверяющего

> Этот файл и каталог `judge/` **не входят** в архив участника.  
> Участникам выдавать только `AIS_participant.zip` (см. `pack_participant.py`).

---

## 1. Подготовка

```bash
cd /путь/к/полному/репозиторию/AIS_sim
pip install -r requirements-judge.txt
```

Проверка:

```bash
python3 judge/ais_judge.py --help
```

---

## 2. Сборка архива для участников

```bash
python3 pack_participant.py --output AIS_participant.zip
```

На портале участник скачивает тот же архив: `GET /api/artek/participant-package`.

**Включено:** `main.py`, `ais_core/`, шаблоны, документация участника.  
**Исключено:** `judge/`, `requirements-judge.txt`, `AIS_sim/*.csv`, старые инструкции.

Проверяющему хранить **полный** репозиторий с `judge/`.

---

## 2a. Тест полного пути участника (организатор)

```bash
python3 judge/run_test_path.py --level 2
python3 judge/run_test_path.py --level 4
```

См. `judge/test_solution/README.md`. Тестовое решение **не выдавать** участникам.

---

## 3. Приём работы

Участник загружает на портал **один файл**: `submission.aispkg`.

Скачайте его в любую папку, например:

```
/tmp/submissions/ivanov_submission.aispkg
```

---

## 4. Автоматическая проверка

```bash
python3 judge/ais_judge.py /tmp/submissions/ivanov_submission.aispkg --extract /tmp/check_ivanov
```

Вывод JSON содержит:
- `grading.score` — баллы за уровень
- `grading.breakdown` — детализация
- `grading.bonus` — за decoder.py / map.py
- `seed_verified` — воспроизводимость генерации
- `plugins` — найденные плагины

Сохранить отчёт:

```bash
python3 judge/ais_judge.py ivanov_submission.aispkg --json-out report_ivanov.json
```

---

## 5. Визуальная проверка (эталон vs участник)

```bash
python3 judge/ais_map.py
```

1. **«Загрузить submission.aispkg»**
2. Зелёный — эталон (расшифровывается из `sealed_blob`)
3. Красный — ответ участника

Или из распакованной папки:

```bash
python3 judge/ais_map.py /tmp/check_ivanov
```

---

## 6. Локальная проверка (папка AIS_sim участника)

Если участник прислал папку целиком (не рекомендуется):

```bash
python3 judge/ais_judge.py /path/to/AIS_sim/
```

---

## 7. Критерии оценивания

| Уровень | Макс. | Критерии |
|---------|-------|----------|
| 1 | 15 | MMSI (5) + name (5) + type (5) |
| 2 | 25 | CSV (15) + карта (10) |
| 3 | 40 | CSV (20) + маршруты (20) |
| 4 | 40 | CSV + карта + зона спуфинга |

Бонус: `decoder.py` (+5), качество (+5), `map.py` (+5).

---

## 8. Защита эталона

- Участнику **не выдаётся** `reference_levelN.csv`
- Эталон в `sealed_blob` внутри `run_sealed.aispkg`
- Расшифровка: `judge/crypto.py` (только у проверяющего)
- Seed не в открытом манифесте

---

## 9. Структура submission.aispkg

| Файл | Описание |
|------|----------|
| `submission_meta.json` | Имя, хеши, плагины |
| `run_sealed.aispkg` | Манифест + зашифрованный эталон |
| `input_levelN.csv` | Вход участника |
| `output_levelN.csv` | Ответ участника |
| `visualization.html` | Карта (если есть) |
| `decoder.py`, `map.py` | Если были в корне проекта |

---

## 10. macOS / Linux / Windows

Команды одинаковые. На Windows: `python` вместо `python3`.

Для `judge/ais_map.py` нужен GUI (PyQt5) — запуск на машине с дисплеем.

---

## 11. Типичные проблемы

| Ситуация | Действие |
|----------|----------|
| `seed_verified: false` | Входной CSV изменён после генерации |
| Нет `visualization.html` | Минус за карту (ур. 2, 4) |
| Нет `output_level3_routes.csv` | Минус за диспетчерскую часть |
| Участник видел `judge/` | Нарушение раздачи — перевыдать `AIS_participant.zip` |
