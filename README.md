### Telemetry (TinyGS) — Backend + Collector + UI

### Описание
Сервис собирает телеметрию из канала TinyGS (Telegram), сохраняет в SQLite и отображает данные на веб-дашборде (графики + карта/траектория по координатам из сообщений).

---

### Требования
- Python 3.10+ (рекомендуется 3.10)
- Node.js 18+ (рекомендуется LTS)
- npm

---

### Структура проекта
- `collect.py` — скрипт сбора данных (пишет в SQLite)
- `app/` — backend (FastAPI + SQLModel)
- `ui/` — frontend (Vite + React)

---

### 1) Переход в папку проекта
```bash
cd /Users/arsenij/Desktop/SpacePi_PolytechUniversity
```

### 2) Создание виртуального окружения и установка зависимостей (один раз)
```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### 3) 4) Сбор данных - Каждый раз, когда нужно обновить базу:
```bash
source .venv/bin/activate
python collect.py
```

# Предупреждение:
	•	При первом запуске Telethon попросит:
	•	номер телефона
	•	код из Telegram
	•	(если включена 2FA) пароль
	•	После успешной авторизации создастся файл сессии, дальше код обычно не нужен.

### 5) Запуск backend (FastAPI) - В первом терминале:
```bash
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```


Проверка backend
	•	Swagger/OpenAPI:
http://127.0.0.1:8000/docs
	•	Пример API запросов:
	•	список спутников:
http://127.0.0.1:8000/api/satellites
	•	телеметрия (пример):
http://127.0.0.1:8000/api/telemetry?sat=Polytech_Universe-3&limit=5



### 6) Запуск frontend (UI) - Во втором терминале:
```bash
cd ui
npm i
npm run dev
```
Открыть в браузере:
	•	http://localhost:5173










