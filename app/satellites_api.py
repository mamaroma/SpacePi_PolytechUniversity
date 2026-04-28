"""
Каталог спутников Polytech Universe и других.

Источник базовых данных: https://spacepi.space + публичные карточки СПбПУ.
Хранится в JSON-файле, чтобы admin / moderator могли через UI добавлять
новые карточки.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .auth import require_editor

router = APIRouter(prefix="/api/satellites", tags=["satellites"])

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "satellites.json"


class SatelliteInfo(BaseModel):
    id: str
    name: str
    name_en: str
    norad: int | None = None
    launch_date: str | None = None      # YYYY-MM-DD
    orbit_alt_km: int | None = None
    frequency_mhz: float | None = None
    protocol: str | None = None
    form_factor: str | None = None
    mass_kg: float | None = None
    status: str = "active"               # active | inactive | lost
    description: str = ""
    mission: str = ""
    image_url: str | None = None
    source_url: str = "https://spacepi.space"


class SatelliteCreate(BaseModel):
    name: str
    name_en: str
    norad: int | None = None
    launch_date: str | None = None
    orbit_alt_km: int | None = None
    frequency_mhz: float | None = None
    protocol: str | None = None
    form_factor: str | None = None
    mass_kg: float | None = None
    status: str = "active"
    description: str = ""
    mission: str = ""
    image_url: str | None = None
    source_url: str = ""


_DEFAULT: list[dict] = [
    {
        "id": "polytech-universe-3",
        "name": "Политех Юниверс-3",
        "name_en": "Polytech Universe-3",
        "norad": 57191,
        "launch_date": "2023-06-27",
        "orbit_alt_km": 565,
        "frequency_mhz": 437.0,
        "protocol": "LoRa (SF8, BW 62.5 кГц)",
        "form_factor": "3U CubeSat",
        "mass_kg": 4.0,
        "status": "active",
        "mission": "Мониторинг космической погоды и АИС-приём",
        "description": (
            "Третий аппарат серии Polytech Universe, запущен 27 июня 2023 г. "
            "вместе с группой школьных спутников программы «Дежурный по планете». "
            "Используется для приёма сигналов АИС морских судов, телеметрии "
            "и образовательных задач СПбПУ."
        ),
        "source_url": "https://spacepi.space",
    },
    {
        "id": "polytech-universe-4",
        "name": "Политех Юниверс-4",
        "name_en": "Polytech Universe-4",
        "norad": 61747,
        "launch_date": "2024-11-05",
        "orbit_alt_km": 575,
        "frequency_mhz": 437.5,
        "protocol": "LoRa",
        "form_factor": "3U CubeSat",
        "mass_kg": 4.0,
        "status": "active",
        "mission": "Передача телеметрии, эксперимент с радиолюбительским ретранслятором",
        "description": (
            "Четвёртый аппарат серии. Запущен с космодрома Восточный 5 ноября 2024 г. "
            "Несёт полезную нагрузку для отработки задач связи и мониторинга."
        ),
        "source_url": "https://spacepi.space",
    },
    {
        "id": "polytech-universe-5",
        "name": "Политех Юниверс-5",
        "name_en": "Polytech Universe-5",
        "norad": 61745,
        "launch_date": "2024-11-05",
        "orbit_alt_km": 575,
        "frequency_mhz": 437.5,
        "protocol": "LoRa",
        "form_factor": "3U CubeSat",
        "mass_kg": 4.0,
        "status": "active",
        "mission": "Совместный эксперимент СПбПУ + ОКБ «Пятое Поколение»",
        "description": (
            "Пятый аппарат серии Polytech Universe. Запущен одновременно с PU-4. "
            "Используется для исследований радиоэлектронной обстановки и "
            "экспериментов с группировкой малых спутников."
        ),
        "source_url": "https://spacepi.space",
    },
    {
        "id": "polytech-universe-6",
        "name": "Политех Юниверс-6",
        "name_en": "Polytech Universe-6",
        "norad": 67282,
        "launch_date": "2025-12-28",
        "orbit_alt_km": 580,
        "frequency_mhz": 437.5,
        "protocol": "LoRa",
        "form_factor": "3U CubeSat",
        "mass_kg": 4.0,
        "status": "active",
        "mission": "Расширение группировки Polytech Universe",
        "description": (
            "Шестой аппарат серии Polytech Universe. Запущен 28 декабря 2025 г. "
            "Является логическим продолжением программы школьных и студенческих "
            "спутников Политеха."
        ),
        "source_url": "https://spacepi.space",
    },
]


def _load() -> list[dict]:
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    if not DATA_FILE.exists():
        DATA_FILE.write_text(
            json.dumps(_DEFAULT, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        return list(_DEFAULT)
    try:
        return json.loads(DATA_FILE.read_text(encoding="utf-8"))
    except Exception:
        return list(_DEFAULT)


def _save(items: list[dict]) -> None:
    DATA_FILE.write_text(
        json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8"
    )


@router.get("/info")
def list_info():
    return _load()


@router.post("/info")
def create_info(body: SatelliteCreate, _=Depends(require_editor)):
    items = _load()
    new_id = body.name_en.lower().replace(" ", "-").replace("/", "-")[:48] or uuid.uuid4().hex[:8]
    if any(it["id"] == new_id for it in items):
        new_id = f"{new_id}-{uuid.uuid4().hex[:4]}"
    item = SatelliteInfo(id=new_id, **body.model_dump()).model_dump()
    items.append(item)
    _save(items)
    return item


@router.delete("/info/{sat_id}")
def delete_info(sat_id: str, _=Depends(require_editor)):
    items = _load()
    new_items = [it for it in items if it["id"] != sat_id]
    if len(new_items) == len(items):
        raise HTTPException(404, "Not found")
    _save(new_items)
    return {"ok": True}
