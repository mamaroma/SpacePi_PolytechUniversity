"""ЭМИ-генератор: синтетические зоны покрытия и точки спектра для обучения.

Используется:
  • страница «Практические кейсы → ЭМИ-генератор»
  • дозаполнение demo_emi, когда реальных пакетов нет
  • согласование шкалы интенсивности с архивом SAT-MONITOR

Шкала intensity (усл. ед.): примерно 23…30 — как в архиве PU.
Мощность power_dbm: −110…−22 дБм для демо-карты Leaflet.
Wi-Fi и военные диапазоны намеренно исключены.
"""
from __future__ import annotations

import math
import random
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional


# Гражданские / образовательные полосы (без Wi-Fi и без военных систем)
CIVIL_BANDS = [
    {
        "id": "vhf-air-mar",
        "label": "VHF авиа/морская",
        "from_mhz": 118.0,
        "to_mhz": 162.0,
        "systems": "Авиация COM 118–137 МГц; морская УКВ 156–162 МГц (AIS 161.975 / 162.025)",
        "freqs": [121.5, 131.5, 156.8, 161.975, 162.025],
    },
    {
        "id": "vhf-ham",
        "label": "VHF любительский",
        "from_mhz": 144.0,
        "to_mhz": 146.0,
        "systems": "Любительский 2 м: CW/SSB/FM, AMSAT downlink",
        "freqs": [144.39, 145.5, 145.8],
    },
    {
        "id": "uhf-ham-cubesat",
        "label": "UHF CubeSat / любители",
        "from_mhz": 430.0,
        "to_mhz": 440.0,
        "systems": "Любительский 70 см; маяки CubeSat ~437 МГц; LoRa ISM EU 433",
        "freqs": [433.0, 435.0, 437.5, 438.0],
    },
    {
        "id": "srd-lora-eu",
        "label": "SRD / LoRa EU",
        "from_mhz": 863.0,
        "to_mhz": 870.0,
        "systems": "SRD868, LoRaWAN EU868, Sigfox RC1",
        "freqs": [868.1, 868.3, 868.5, 869.525],
    },
    {
        "id": "ism-915",
        "label": "ISM 915",
        "from_mhz": 902.0,
        "to_mhz": 928.0,
        "systems": "LoRaWAN US915 / AU915, RFID UHF (гражданский)",
        "freqs": [915.0, 920.0, 923.0],
    },
    {
        "id": "gnss-l1",
        "label": "GNSS L1",
        "from_mhz": 1550.0,
        "to_mhz": 1620.0,
        "systems": "GPS L1 1575.42; Galileo E1; ГЛОНАСС L1; BeiDou B1",
        "freqs": [1575.42, 1602.0, 1561.1],
    },
]


# Регионы → «зоны покрытия» генератора (больше, чем 3 архивных пятна)
COVERAGE_ZONES = [
    ("Сев.-Запад РФ", 59.9, 30.3, 1.8),
    ("Центр. Россия", 55.8, 37.6, 2.0),
    ("Урал", 56.8, 60.6, 2.2),
    ("Сибирь", 56.0, 92.9, 2.5),
    ("Дальний Восток", 43.1, 131.9, 2.2),
    ("Сев. Европа", 59.3, 18.1, 2.0),
    ("Зап. Европа", 48.9, 2.3, 2.0),
    ("Средиземноморье", 35.0, 25.0, 2.5),
    ("Ближний Восток", 25.3, 55.3, 2.0),
    ("Юж. Азия", 19.0, 73.0, 2.5),
    ("Вост. Азия", 35.7, 139.8, 2.2),
    ("ЮВА", 1.3, 103.8, 2.0),
    ("Вост. Африка", 6.5, 3.4, 2.5),
    ("Юж. Африка", -33.9, 18.4, 2.0),
    ("Вост. США", 40.7, -74.0, 2.2),
    ("Зап. США", 34.1, -118.2, 2.2),
    ("Юж. Америка", -23.5, -46.6, 2.5),
    ("Австралия", -33.9, 151.2, 2.2),
    ("Индийский океан (архив)", -21.0, 101.8, 3.0),
    ("Юж. Атлантика (архив)", -22.0, -14.0, 2.5),
]


SOURCES = [
    "CubeSat beacon (UHF)",
    "Satellite downlink noise",
    "LoRa satellite uplink",
    "VHF maritime AIS",
    "VHF airband spillover",
    "Atmospheric ducting",
    "Ionospheric scintillation",
    "GNSS multipath / noise",
    "Industrial SRD",
    "Amateur radio net",
]


def intensity_from_power_dbm(power_dbm: float) -> float:
    """Согласуем дБм демо-карты с усл. ед. архива SAT-MONITOR (~23…30)."""
    # −110 → 23, −22 → 30
    t = (float(power_dbm) + 110.0) / 88.0
    t = max(0.0, min(1.0, t))
    return round(23.0 + t * 7.0, 3)


def power_from_intensity(intensity: float) -> float:
    t = (float(intensity) - 23.0) / 7.0
    t = max(0.0, min(1.0, t))
    return round(-110.0 + t * 88.0, 1)


def list_bands() -> List[Dict[str, Any]]:
    return [
        {
            "id": b["id"],
            "label": b["label"],
            "from_mhz": b["from_mhz"],
            "to_mhz": b["to_mhz"],
            "systems": b["systems"],
        }
        for b in CIVIL_BANDS
    ]


def generate_emi(
    *,
    seed: int = 42,
    zones: Optional[int] = None,
    points_per_zone: int = 40,
    band_ids: Optional[List[str]] = None,
    days: int = 5,
) -> Dict[str, Any]:
    """Сгенерировать набор точек ЭМИ + метаданные зон покрытия."""
    rng = random.Random(int(seed))
    n_zones = zones if zones is not None else len(COVERAGE_ZONES)
    n_zones = max(3, min(n_zones, len(COVERAGE_ZONES)))
    chosen_zones = COVERAGE_ZONES[:n_zones]

    bands = CIVIL_BANDS
    if band_ids:
        idset = set(band_ids)
        bands = [b for b in CIVIL_BANDS if b["id"] in idset] or CIVIL_BANDS

    now = datetime.now(timezone.utc)
    packets: List[Dict[str, Any]] = []
    coverage: List[Dict[str, Any]] = []
    idx = 0

    for zi, (name, clat, clon, spread) in enumerate(chosen_zones):
        zone_intensity = 24.5 + rng.random() * 5.0
        coverage.append(
            {
                "id": zi + 1,
                "name": name,
                "lat": clat,
                "lon": clon,
                "radius_km": round(800 + rng.random() * 1800, 1),
                "intensity": round(zone_intensity, 3),
                "intensity_label": _label(zone_intensity),
            }
        )
        for _ in range(points_per_zone):
            band = rng.choice(bands)
            lat = clat + (rng.random() - 0.5) * spread * 2
            lon = clon + (rng.random() - 0.5) * spread * 2
            # ближе к центру — сильнее
            d2 = (lat - clat) ** 2 + (lon - clon) ** 2
            base = -28 - d2 * 1.8
            power = max(-110.0, min(-22.0, base + (rng.random() - 0.5) * 14))
            intens = intensity_from_power_dbm(power)
            freq = rng.choice(band["freqs"])
            day = rng.randint(0, max(0, days - 1))
            ts = now - timedelta(days=day, hours=rng.randint(0, 23), minutes=rng.randint(0, 59))
            idx += 1
            packets.append(
                {
                    "id": idx,
                    "lat": round(lat, 4),
                    "lon": round(lon, 4),
                    "freq_mhz": freq,
                    "power_dbm": round(power, 1),
                    "intensity": intens,
                    "intensity_label": _label(intens),
                    "band_id": band["id"],
                    "band_label": band["label"],
                    "systems": band["systems"],
                    "source": rng.choice(SOURCES),
                    "ts": ts.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "region": name,
                    "day": day + 1,
                    "synthetic": True,
                }
            )

    return {
        "meta": {
            "seed": seed,
            "zones": n_zones,
            "points": len(packets),
            "days": days,
            "bands": list_bands(),
            "intensity_scale": {
                "unit": "усл. ед. ЭМИ-генератора",
                "min": 23.0,
                "max": 30.0,
                "labels": [
                    {"max": 24.8, "label": "Низкая"},
                    {"max": 26.2, "label": "Слабая"},
                    {"max": 27.6, "label": "Средняя"},
                    {"max": 29.0, "label": "Высокая"},
                    {"max": 30.0, "label": "Критическая"},
                ],
                "note": "Согласовано с архивом SAT-MONITOR; power_dbm ≈ −110…−22",
            },
            "excluded": ["Wi-Fi 2.4/5 ГГц", "военные / спецслужбы диапазоны"],
        },
        "coverage_zones": coverage,
        "packets": packets,
    }


def _label(intensity: float) -> str:
    if intensity < 24.8:
        return "Низкая"
    if intensity < 26.2:
        return "Слабая"
    if intensity < 27.6:
        return "Средняя"
    if intensity < 29.0:
        return "Высокая"
    return "Критическая"


def heat_points_from_packets(packets: List[Dict[str, Any]]) -> List[List[float]]:
    """Формат leaflet.heat: [lat, lon, weight 0…1]."""
    out = []
    for p in packets:
        intens = p.get("intensity")
        if intens is None and p.get("power_dbm") is not None:
            intens = intensity_from_power_dbm(p["power_dbm"])
        w = max(0.0, min(1.0, (float(intens) - 23.0) / 7.0))
        out.append([float(p["lat"]), float(p["lon"]), round(w, 4)])
    return out
