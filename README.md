# 🛰 SpacePi Ground Station

Telemetry dashboard for **Polytech Universe** CubeSats — parses TinyGS Telegram channel, stores packets in SQLite/PostgreSQL, and visualises them in a real-time React dashboard with 3D globe, orbit propagation (SGP4), and telemetry charts.

---

## Architecture

```
Telegram Channel (TinyGS)
        │  Telethon
        ▼
  collect.py / app/collector.py   →  SQLite / PostgreSQL
                                          │
                                    app/ (FastAPI)
                                     /api/telemetry
                                     /api/orbit/track
                                     /api/collect/run
                                          │  JSON REST
                                        ui/ (React + Vite)
                                     3D Globe · Charts · Table
```

---

## Project Structure

```
SpacePi_PolytechUniversity/
│
├── app/                    # FastAPI backend package
│   ├── main.py             #   Routes: telemetry, satellites, orbit, collect
│   ├── collector.py        #   Telethon → DB ingestion
│   ├── collect_api.py      #   POST /api/collect/run endpoint
│   ├── db.py               #   SQLModel engine + session
│   ├── models.py           #   TelemetryPacket table model
│   └── parser.py           #   TinyGS message regex parser
│
├── ui/                     # React + Vite frontend
│   ├── src/
│   │   ├── App.jsx         #   Main dashboard layout
│   │   ├── api.js          #   Fetch wrappers
│   │   ├── styles.css      #   Dark space theme
│   │   └── components/
│   │       ├── GlobeCard.jsx   3D Globe (react-globe.gl + THREE.js)
│   │       ├── MapCard.jsx     2D Map (react-leaflet, dark tiles)
│   │       ├── ChartCard.jsx   Line charts (recharts)
│   │       ├── MetricCard.jsx  KPI widgets with RSSI bars
│   │       └── ErrorBoundary.jsx
│   ├── Dockerfile          #   Node build → nginx:alpine
│   ├── nginx.conf          #   SPA + /api proxy to backend
│   └── vite.config.js      #   Dev proxy → :8000
│
├── scripts/                # Database setup
│   ├── init_postgres.py    #   create_all via SQLModel
│   └── init_postgres.sql   #   PostgreSQL role + DB bootstrap
│
├── data/                   # All data files
│   ├── exports/            #   Telegram message snapshots (txt/json)
│   ├── processed/          #   MATLAB output files (.mat)
│   ├── state/              #   Telethon resume flags (JSON)
│   └── urls.csv            #   URL list for legacy scraper
│
├── matlab/                 # MATLAB analysis scripts
│   ├── main.m              #   Entry: load & process telemetry
│   ├── process_json_matlab.m  #   JSON → MATLAB table
│   └── *.json              #   Raw JSON samples
│
├── legacy/                 # Archived one-off scripts (not in active use)
│   ├── parse.py            #   Selenium TinyGS scraper
│   ├── data_processor.py   #   CSV URL batch downloader
│   ├── tsts.py             #   Interactive Telethon explorer
│   └── chromedriver/       #   ChromeDriver binary
│
├── docs/                   # Design documents
│   └── ТЗ на сшивание через флаги сложное.txt
│
├── collect.py              # CLI: run one-shot collection
├── main.py                 # CLI: export Telegram link snapshots → data/exports/
├── telegram_handler.py     # Telethon helpers (flags-based collection)
├── state_manager.py        # Resume-flag persistence
├── utils.py                # Logging, user-agent helpers
├── telemetry_config.py     # Central settings (loaded from .env)
│
├── Dockerfile              # Python 3.11 backend image
├── docker-compose.yml      # Full stack: api + ui
├── .dockerignore
├── .env.example            # Environment variable template
├── .gitignore
├── requirements.txt
└── README.md
```

---

## Quick Start — Docker (recommended)

> No Python or Node required on your machine — Docker handles everything.

```bash
# 1. Clone & enter the project
git clone <repo-url>
cd SpacePi_PolytechUniversity

# 2. Create your environment file
cp .env.example .env
# Edit .env — fill in TG_API_ID, TG_API_HASH, TLE lines

# 3. (First time only) Authenticate Telethon interactively
python collect.py   # will prompt for phone / code; creates telemetry_session.session

# 4. Build and start everything
docker compose up --build -d

# 5. Open the dashboard
open http://localhost:5173
```

The API is also accessible at `http://localhost:8000` (Swagger at `/docs`).

**Collect fresh data from inside Docker:**
```bash
docker compose exec api python collect.py
```

**Stop / restart:**
```bash
docker compose down        # stop
docker compose up -d       # restart (no rebuild)
docker compose up --build  # rebuild images
```

Data is persisted in a named Docker volume (`telemetry_data`) — your DB survives container restarts.

---

## Quick Start — Local Development

**Prerequisites:** Python 3.11+, Node 20+

```bash
# Backend
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # fill in values

uvicorn app.main:app --reload --port 8000

# Frontend (separate terminal)
cd ui
npm install
npm run dev                     # http://localhost:5173
```

---

## Collecting Telemetry

| Command | Description |
|---------|-------------|
| `python collect.py` | Collect last 30 days from Telegram into DB |
| `python main.py` | Export link list to `data/exports/` (txt + json) |
| `POST /api/collect/run` | Trigger collection via API (requires `COLLECT_TOKEN`) |

The dashboard **"⬆ Collect"** button calls `POST /api/collect/run`. Set `COLLECT_TOKEN` in `.env` and paste it into the 🔑 field in the UI.

---

## Environment Variables

Copy `.env.example` → `.env` and set:

| Variable | Description | Default |
|----------|-------------|---------|
| `TG_API_ID` | Telegram app ID (my.telegram.org) | — |
| `TG_API_HASH` | Telegram app hash | — |
| `TG_CHANNEL` | Telegram channel to parse | `t.me/tinyGS_Telemetry` |
| `DATABASE_URL` | SQLAlchemy URL | `sqlite:///./telemetry.db` |
| `TELETHON_SESSION_NAME` | File-based Telethon session path | `./telemetry_session` |
| `TELETHON_SESSION_STRING` | Telethon StringSession for hosted deploys | *(empty)* |
| `COLLECT_TOKEN` | Token for `/api/collect/run` | *(empty = no auth)* |
| `CORS_ALLOW_ORIGINS` | Comma-separated origins | `*` |
| `AUTO_COLLECT_ENABLED` | Enable server-side scheduled collect loop | `false` |
| `AUTO_COLLECT_INTERVAL_MINUTES` | Scheduled collect interval | `30` |
| `TLE_POLYTECH_UNIVERSE_3_1` | TLE line 1 for Polytech Universe-3 | — |
| `TLE_POLYTECH_UNIVERSE_3_2` | TLE line 2 for Polytech Universe-3 | — |

Add more satellites with `TLE_<NORMALIZED_NAME>_1 / _2`
(e.g. `Polytech_Universe-5` → `TLE_POLYTECH_UNIVERSE_5_1`).

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/satellites` | List all satellite names in DB |
| GET | `/api/telemetry?sat=&from=&to=&limit=` | Raw telemetry packets |
| GET | `/api/telemetry/series?sat=&from=&to=` | Time-series for charting |
| GET | `/api/orbit/track?sat=&at=&minutes=&step_sec=` | SGP4 orbit ground track |
| POST | `/api/collect/run?token=` | Trigger Telegram collection |
| GET | `/docs` | Swagger UI |

---

## Database

- **Default:** SQLite at `telemetry.db` (auto-created on first run)
- **PostgreSQL:** set `DATABASE_URL=postgresql+psycopg2://user:pass@host/db` and run `python scripts/init_postgres.py`

---

## Render Auto-Collect

For hosted automatic collection without browser errors:

1. Set `DATABASE_URL` to the **internal** Render PostgreSQL URL.
2. Set `AUTO_COLLECT_ENABLED=true`.
3. Set `AUTO_COLLECT_INTERVAL_MINUTES=30` (or another interval).
4. Set `TELETHON_SESSION_STRING` to a valid Telethon string session.

Generate the string session locally after logging in:

```bash
python collect.py
python scripts/print_session_string.py
```

Paste the printed value into the Render environment variable `TELETHON_SESSION_STRING`.
The frontend should only read from the API/DB; the backend performs Telegram collection on a schedule.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.11 · FastAPI · SQLModel · Telethon · SGP4 |
| Frontend | React 18 · Vite 5 · recharts · react-globe.gl · react-leaflet |
| 3D | THREE.js via react-globe.gl |
| Containerisation | Docker · docker compose · nginx |
| DB | SQLite (default) / PostgreSQL |
