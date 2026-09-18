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
    status: str = "active"               # active | inactive | lost | announced
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
        "id": "polytech-universe-1",
        "name": "Политех Юниверс-1",
        "name_en": "Polytech Universe-1",
        "norad": 53371,
        "launch_date": "2022-08-09",
        "orbit_alt_km": 530,
        "frequency_mhz": 437.0,
        "protocol": "LoRa / RS11S",
        "form_factor": "3U CubeSat",
        "mass_kg": 4.51,
        "status": "lost",
        "mission": "Измерение уровня электромагнитного излучения над Землёй",
        "description": (
            "Первый спутник СПбПУ Петра Великого, созданный совместно со "
            "Специальным технологическим центром (СТЦ). Нёс на борту спектрометры "
            "и радиопередатчик для оценки распределения ЭМИ-фона по поверхности "
            "планеты в разных частотных диапазонах. Запущен 09.08.2022 с "
            "космодрома «Байконур» РН «Союз-2.1б» с РБ «Фрегат». "
            "Сошёл с орбиты 09.10.2024."
        ),
        "image_url": "/pu12-photo.jpg",
        "source_url": "https://spacepi.space/satellites/polytech-universe-1-i-2/",
    },
    {
        "id": "polytech-universe-2",
        "name": "Политех Юниверс-2",
        "name_en": "Polytech Universe-2",
        "norad": 53372,
        "launch_date": "2022-08-09",
        "orbit_alt_km": 540,
        "frequency_mhz": 437.0,
        "protocol": "LoRa / RS10S",
        "form_factor": "3U CubeSat",
        "mass_kg": 4.51,
        "status": "lost",
        "mission": "Измерение уровня электромагнитного излучения над Землёй",
        "description": (
            "Парный аппарат к Polytech Universe-1. Решал ту же задачу — "
            "построение глобальной карты ЭМ излучения. Использовал для приёма "
            "и контроля сеть радиолюбительских станций (SatNOGS, TinyGS). "
            "Сошёл с орбиты 18.10.2024."
        ),
        "image_url": "/pu12-photo.jpg",
        "source_url": "https://spacepi.space/satellites/polytech-universe-1-i-2/",
    },
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
        "image_url": "https://spacepi.space/uploads/PU_3_543c54b2af.jpg",
        "source_url": "https://spacepi.space/satellites/politeh-yunivers-3/",
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
        "image_url": "/pu4-photo.jpg",
        "source_url": "https://spacepi.space/satellites/politeh-yunivers-4/",
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
        "image_url": "/pu5-photo.jpg",
        "source_url": "https://spacepi.space/satellites/politeh-yunivers-5/",
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
        "form_factor": "16U CubeSat",
        "mass_kg": 24.0,
        "status": "active",
        "mission": "ДЗЗ в радиочастотном диапазоне и приём AIS",
        "description": (
            "Шестой аппарат серии Polytech Universe — самый крупный в линейке. "
            "Малый космический аппарат СПбПУ Петра Великого формата 16U для "
            "дистанционного зондирования Земли в радиочастотном диапазоне и "
            "приёма сигналов автоматической идентификационной системы судов "
            "(AIS). Запущен 28 декабря 2025 г."
        ),
        "image_url": "/pu6-photo.jpg",
        "source_url": "https://spacepi.space/satellites/politeh-yunivers-6/",
    },
    {
        "id": "polytech-universe-7",
        "name": "Политех Юниверс-7",
        "name_en": "Polytech Universe-7",
        "norad": None,
        "launch_date": None,
        "orbit_alt_km": 625,
        "frequency_mhz": 435.0,
        "protocol": "9600 bps / УКВ",
        "form_factor": "6U CubeSat",
        "mass_kg": 12.0,
        "status": "announced",
        "mission": "Межспутниковая оптическая связь с КА Twin-S (Space-π / «Дежурный по планете»)",
        "description": (
            "Планируемый аппарат ООО «Телеком-Политехник» формата 6U. "
            "Предназначен для организации межспутникового оптического канала "
            "связи с КА Twin-S в интересах космического мониторинга. "
            "Полезная нагрузка: одноколлиматорная система межспутниковой "
            "оптической связи (λ = 1550 нм, ≥ 200 Мбит/с) и звёздный датчик "
            "ориентации. Орбита ССО 600–650 км, ДУ — есть, срок службы "
            "2 года (до 3). Управление — из ЦУП на базе СПбПУ."
        ),
        "image_url": None,
        "source_url": "https://spacepi.space",
    },
    {
        "id": "cstp-5-2",
        "name": "CSTP-5.2",
        "name_en": "CSTP-5.2",
        "norad": None,
        "launch_date": None,
        "orbit_alt_km": 625,
        "frequency_mhz": 435.25,
        "protocol": "9600 bps / УКВ",
        "form_factor": "3U CubeSat",
        "mass_kg": 4.5,
        "status": "announced",
        "mission": "Измерение ЭМИ (100 МГц – 18 ГГц) для 3D-модели и территориальных карт",
        "description": (
            "Планируемый малый КА СПбПУ формата 3U (сертификат общего вида, "
            "авг. 2026). Вместе с CSTP-5.3 предназначен для измерения уровней "
            "электромагнитного излучения в широком диапазоне частот, построения "
            "трёхмерной нестационарной модели распределения ЭМИ и "
            "территориальных карт для долгосрочного анализа. ПН — "
            "широкополосный радиоприёмник 100 МГц – 18 ГГц (1,2 кг / 1U). "
            "Орбита ССО 600–650 км, без ДУ, средняя мощность 8 Вт. "
            "Управление — ЦУП «Политех Спейс», СПбПУ."
        ),
        "image_url": None,
        "source_url": "https://www.spbstu.ru",
    },
    {
        "id": "cstp-5-3",
        "name": "CSTP-5.3",
        "name_en": "CSTP-5.3",
        "norad": None,
        "launch_date": None,
        "orbit_alt_km": 625,
        "frequency_mhz": 435.25,
        "protocol": "9600 bps / УКВ",
        "form_factor": "3U CubeSat",
        "mass_kg": 4.5,
        "status": "announced",
        "mission": "Измерение ЭМИ (100 МГц – 18 ГГц) для 3D-модели и территориальных карт",
        "description": (
            "Планируемый парный аппарат к CSTP-5.2 (сертификат общего вида "
            "СПбПУ, авг. 2026). Те же ТТХ: 3U / 4,5 кг, ССО 600–650 км, "
            "передатчик 435,250 МГц · 9600 бит/с, широкополосный радиоприёмник "
            "100 МГц – 18 ГГц. Совместная миссия — карта ЭМИ и статистический "
            "анализ радиационного фона. Управление — ЦУП «Политех Спейс»."
        ),
        "image_url": None,
        "source_url": "https://www.spbstu.ru",
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
        items = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    except Exception:
        return list(_DEFAULT)

    # One-off migration: подменяем устаревшее локальное фото PU-3 на
    # официальное с spacepi.space (запрос пользователя).
    changed = False
    OLD_PU3 = {"/pu3-photo.jpg", "pu3-photo.jpg"}
    NEW_PU3 = "https://spacepi.space/uploads/PU_3_543c54b2af.jpg"
    for it in items:
        if it.get("id") == "polytech-universe-3" and it.get("image_url") in OLD_PU3:
            it["image_url"] = NEW_PU3
            changed = True

    # Планируемые: актуальные карточки PU-7 / CSTP-5.2 / CSTP-5.3.
    # Удаляем устаревшие заглушки PU-8/PU-9 и подтягиваем поля из _DEFAULT.
    LEGACY_ANNOUNCED = {"polytech-universe-8", "polytech-universe-9"}
    before = len(items)
    items = [it for it in items if it.get("id") not in LEGACY_ANNOUNCED]
    if len(items) != before:
        changed = True

    by_id = {it.get("id"): it for it in items}
    for d in _DEFAULT:
        if d.get("status") != "announced":
            continue
        existing = by_id.get(d["id"])
        if existing is None:
            items.append(dict(d))
            changed = True
            continue
        # Обновляем ТТХ у планируемых карточек (сертификаты Волвенко / СПбПУ).
        for key in (
            "name", "name_en", "orbit_alt_km", "frequency_mhz", "protocol",
            "form_factor", "mass_kg", "mission", "description", "source_url",
            "status",
        ):
            if existing.get(key) != d.get(key):
                existing[key] = d.get(key)
                changed = True

    if changed:
        try:
            _save(items)
        except Exception:
            pass
    return items


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
