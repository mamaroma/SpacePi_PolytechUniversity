# Инструкция участника

Единственный рабочий документ для участника.  
Описание задания: [ZADANIE.md](ZADANIE.md)

---

## 0. Что вам выдали и что удалить

### Архив участника (`AIS_participant.zip`)

Содержит **без** каталога `judge/` и **без** готовых `input_` / `output_` файлов.

Если в папке `AIS_sim/` остались старые примеры с прошлой работы — **их можно удалить**.  
При Шаге 1 они перезапишутся или удалятся автоматически.

### Что загружать на портал

| Загружать | Не загружать |
|-----------|--------------|
| `AIS_sim/submission.aispkg` | Весь проект, zip с кодом, отдельные csv |

---

## 1. Требования

| Параметр | Значение |
|----------|----------|
| Python | 3.10+ |
| ОС | Windows / macOS / Linux |
| Для `main.py` | Только Python (tkinter встроен) |
| Для вашего решения | Любые библиотеки на ваш выбор |
| Язык решения | Рекомендуется Python 3 |

Проверка:

```bash
python3 --version
python3 -c "import tkinter; print('OK')"
```

---

## 2. Структура каталогов

```
AIS_sim/                    ← РАБОЧАЯ ПАПКА (вход/выход)
├── input_levelN.csv        ← создаёт main.py (Шаг 1)
├── output_levelN.csv       ← создаёте ВЫ (Шаг 2)
├── visualization.html      ← создаёте ВЫ (Шаг 3)
├── submission.aispkg       ← создаёт main.py (Шаг 4)
└── run_sealed.aispkg       ← служебный, не трогать

КОРЕНЬ ПРОЕКТА (рядом с main.py):
├── main.py
├── my_solver.py            ← ВАШ парсер (любое имя)
├── decoder.py              ← опционально (из decoder.py.example)
├── map.py                  ← опционально (из map.py.example)
└── participant_map.py      ← только самопроверка
```

### Куда класть файлы

| Файл | Куда |
|------|------|
| `decoder.py` | **Корень проекта** (рядом с `main.py`) |
| `map.py` | **Корень проекта** (рядом с `main.py`) |
| `output_levelN.csv` | **`AIS_sim/`** |
| `visualization.html` | **`AIS_sim/`** |
| `output_level3_routes.csv` | **`AIS_sim/`** |
| `output_level4_spoof_zone.json` | **`AIS_sim/`** |

> ❌ Не кладите `decoder.py` / `map.py` внутрь `AIS_sim/`

---

## 3. Четыре шага (порядок строгий)

```
Шаг 1  main.py          →  input_levelN.csv
Шаг 2  ВАШ парсер       →  output_levelN.csv
Шаг 3  ВАША карта       →  visualization.html
Шаг 4  main.py          →  submission.aispkg  →  на портал
```

### Важно про main.py

| Шаг | Делает main.py? | Кто делает |
|-----|-----------------|------------|
| 1 | ✅ Да | Генерация входа |
| 2 | ❌ Нет (только кнопка «Проверить») | **Вы сами** |
| 3 | ⚠️ Кнопка «Построить карту» — **самопроверка**, не зачёт | **Вы сами** (`map.py`) |
| 4 | ✅ Да | Сборка submission |

---

## 4. Шаг 1 — Генерация входных данных

### macOS

```bash
cd /путь/к/проекту
python3 main.py --level 2
```

Окно GUI может открыться **за другими окнами** — смотрите иконку Python на **Dock**.  
Для надёжности на Mac используйте команду `--level` без GUI.

### Windows / Linux

```bash
python main.py --level 2
# или
python main.py
```

### Результат

- `AIS_sim/input_level2.csv`
- `AIS_sim/run_sealed.aispkg`
- Старый `output_level2.csv` **удалён автоматически**

В логе будет, например:

```
Пакетов: 34, с нарушением синтаксиса: ~2
```

GUI и CLI используют **один и тот же** генератор — ошибочные пакеты создаются в обоих режимах.

---

## 5. Шаг 2 — Ваш парсер (основное задание)

Напишите программу, которая читает `input_levelN.csv` и пишет `output_levelN.csv`.

### Вход

```csv
timestamp,ais_sentence
2026-01-27T03:41:27,"!AIVDM,1,1,,A,39>Lrh3Ukwl1?S7R0:4,0*15"
```

### Алгоритм

1. Проверить формат `!AIVDM,...,*CS`
2. Извлечь payload (6-bit ASCII → bytes)
3. Прочитать MMSI, lat, lon, speed
4. Применить фильтры уровня
5. Записать CSV

### Форматы выхода

**Уровень 1** — `output_level1.csv`:

```csv
mmsi,name,type
273291710,NORDIC SPIRIT,Cargo
273319680,BALTIC STAR,Tanker
```

**Уровни 2–4** — `output_levelN.csv`:

```csv
mmsi,lat,lon,speed,last_seen
211000555,60.60989,28.53218,16.1,2026-01-27T03:41:27
```

### Проверка в main.py

После сохранения `output_levelN.csv` откройте `main.py` → **«Проверить мой output_levelN.csv»**.

Вы увидите:
- корректность колонок;
- ориентировочное число строк;
- замечания (мало MMSI, нет name/type, нет карты);
- **не** точный балл (это только у проверяющего).

### Шаблон декодера (опционально)

```bash
cp decoder.py.example decoder.py
# реализуйте decode_ais() СВОИМ кодом
python3 run_decoder.py
```

---

## 6. Шаг 3 — Ваша визуализация

### Обязательно

- Уровень **2**: карта трека
- Уровень **4**: карта треков + зона спуфинга

### Своя карта (рекомендуется)

```bash
cp map.py.example map.py
```

Файл `map.py` — в **корне проекта**.  
Функция `visualize(input_csv, output_csv, output_html)`.

### Быстрая самопроверка (не зачёт)

```bash
python3 participant_map.py --csv AIS_sim/output_level2.csv
```

Или кнопка в `main.py` → **«Построить карту из output_levelN.csv»**.

На macOS, если браузер не открылся — откройте вручную:

```
AIS_sim/visualization.html
```

Карта рисует **разные цвета по MMSI** и линии треков.

---

## 7. Шаг 4 — Отправка

```bash
python3 main.py
```

1. Имя участника
2. **«Собрать submission.aispkg»**
3. Загрузить на портал: `AIS_sim/submission.aispkg`

---

## 8. Задания по уровням

### Уровень 1 (15 б.)

Финский залив. Отфильтровать битые пакеты и невозможные координаты.  
Ответ: `mmsi`, `name`, `type`.

### Уровень 2 (25 б.)

Приморск. Один трек, убрать «прыжки» координат.  
Ответ: CSV + `visualization.html`.

### Уровень 3 (40 б.)

Панамский канал. 13 судов в двух фарватерах (север/юг).  
Ответ: `output_level3.csv` + `output_level3_routes.csv` (маршруты на другой берег).

### Уровень 4 (40 б.)

Балтика. 4 судна — **4 параллельных трека** (разные MMSI, разные цвета на карте).  
В зоне спуфинга координаты искажены — восстановить истинные.  
Ответ: CSV + `output_level4_spoof_zone.json` + карта.

Пример `output_level4_spoof_zone.json`:

```json
{
  "center_lat": 58.842175,
  "center_lon": 20.722961,
  "radius_nm": 4.0
}
```

---

## 9. macOS — особенности

| Проблема | Решение |
|----------|---------|
| Окно не видно | Иконка на Dock; или `python3 main.py --level N` |
| Нет вывода в терминале | GUI молчит — это нормально; используйте `--level` |
| Карта не открылась | Откройте `AIS_sim/visualization.html` вручную в браузере |
| `python` vs `python3` | На Mac используйте `python3` |

---

## 10. Чек-лист перед отправкой

- [ ] Шаг 1: есть `input_levelN.csv` для нужного уровня
- [ ] Шаг 2: есть `output_levelN.csv` с правильными колонками
- [ ] Проверка в main.py прошла без критических ошибок
- [ ] Шаг 3: есть `visualization.html` (ур. 2, 4)
- [ ] Ур. 3: есть `output_level3_routes.csv`
- [ ] Ур. 4: есть `output_level4_spoof_zone.json`
- [ ] Шаг 4: собран `submission.aispkg`
- [ ] На портал загружен **только** `submission.aispkg`

---

## 11. Пример полного цикла (уровень 2)

```bash
cd ~/Desktop/AIS_sim

# Шаг 1
python3 main.py --level 2

# Шаг 2 — ваш код
python3 my_ais_solver.py

# Проверка
python3 main.py --gui
# → «Проверить мой output_levelN.csv»

# Шаг 3
python3 participant_map.py --csv AIS_sim/output_level2.csv

# Шаг 4
python3 main.py --gui
# → «Собрать submission.aispkg»
```

---

## 12. Частые ошибки

| Ошибка | Правильно |
|--------|-----------|
| Ждут, что Шаг 2 в main.py | Шаг 2 — **ваш** отдельный скрипт |
| `decoder.py` в `AIS_sim/` | Положить в **корень** |
| Сдали весь zip на портал | Только `submission.aispkg` |
| Скопировали `run_decoder.py` как решение | Написать **свой** парсер с фильтрами |
| «34 строки» без проверки колонок | Нажать «Проверить мой output» в main.py |
