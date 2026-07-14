# Инструкция для проверяющего (НЕ выдавать участнику)

## Состав папки `judge/`

| Файл | Назначение |
|------|------------|
| `competition_runner.py` | Генерация сессии + скрытый эталон + оценка |
| `ais_map.py` | Сравнение эталона и ответа участника на карте (PyQt + plotly) |
| `package_participant.py` | Сборка чистого архива для участника |
| `INSTRUCTION_JUDGE.md` | Этот документ |

---

## 1. Подготовка архива для участника

Перед публикацией на портал:

```bash
cd AIS_sim
python judge/package_participant.py
```

Скрипт:
- удаляет `input_level*.csv`, `output_level*.csv`, `reference_level*.csv`, `*.map.html`;
- **не включает** папку `judge/`, `ais_map.py`, `competition_runner.py`;
- создаёт `AIS_sim_participant.zip`.

---

## 2. Генерация эталона (локально / офлайн)

```bash
cd AIS_sim
python judge/competition_runner.py --level 2 --out session_level2
```

Создаётся:
- `session_level2/input_level2.csv` — можно отдать участнику как вход
- `session_level2/.judge/reference_level2.b64` — **скрытый эталон** (участнику не отдавать)

---

## 3. Проверка ответа участника

Положите в папку сессии:
- `participant_output.csv` **или** `output_levelN.csv` (переименуйте при необходимости)
- опционально `participant_decoder.py`, `participant_map.py`

```bash
python judge/competition_runner.py --level 2 --out session_level2 --evaluate
```

Результат в `evaluation_result.json`.

---

## 4. Визуальное сравнение (ais_map.py)

Требует: `pip install PyQt5 PyQtWebEngine plotly`

```bash
cd AIS_sim
python judge/ais_map.py
```

В окне выберите:
- эталонный CSV (из `.judge` после расшифровки или служебный reference);
- CSV участника.

Зелёный — эталон, красный — участник.

---

## 5. Проверка через портал

Раздел **Artek registration** на polyspace:
- эталон в БД (`reference_enc`), участнику не доступен;
- загрузка `output_levelN.csv` → автоматический скоринг.

---

## 6. Критерии баллов

См. `Konkurs.docx` (максимум 120 баллов по уровням 1–4).

Пропорциональная оценка: доля совпавших строк относительно эталона + бонусы за свой декодер и карту.
