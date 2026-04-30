from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional


_float = r"[-+]?\d+(?:\.\d+)?"


@dataclass
class Parsed:
    satellite: str
    tle_lat: Optional[float] = None
    tle_lon: Optional[float] = None

    temp_c: Optional[float] = None
    temp_min_c: Optional[float] = None
    temp_max_c: Optional[float] = None

    vbus_mv: Optional[int] = None
    ibus_ma: Optional[int] = None
    battery_capacity_pct: Optional[float] = None
    solar_voltage_mv: Optional[int] = None
    solar_total_mw: Optional[int] = None

    rssi_dbm: Optional[int] = None
    snr_db: Optional[int] = None

    uptime_sec: Optional[int] = None
    reset_count: Optional[int] = None


SAT_RE = re.compile(r"^🛰\s*(?P<sat>.+)\s*$", re.MULTILINE)

# Альтернативные имена в TinyGS-канале → канонические имена в нашей БД.
# Бот иногда присылает короткие тэги (PolyU-4, PU-4) — мы их нормализуем.
SAT_ALIASES: dict[str, str] = {}
for n in (3, 4, 5, 6, 1, 2):
    canon = f"Polytech_Universe-{n}"
    SAT_ALIASES[canon] = canon
    SAT_ALIASES[f"Polytech Universe-{n}"] = canon
    SAT_ALIASES[f"Polytech-Universe-{n}"] = canon
    SAT_ALIASES[f"Polytech_Universe_{n}"] = canon
    SAT_ALIASES[f"PolyU-{n}"] = canon
    SAT_ALIASES[f"Poly_U-{n}"] = canon
    SAT_ALIASES[f"PU-{n}"] = canon
    SAT_ALIASES[f"PU{n}"] = canon


def _normalize_sat(name: str) -> str:
    name = (name or "").strip()
    if not name:
        return name
    # Чистим частые "хвосты" вроде "Polytech_Universe-3 (3U)"
    cleaned = name.split("(")[0].strip()
    return SAT_ALIASES.get(cleaned, cleaned)

TLE_LOC_RE = re.compile(r"TLE Location:\s*\[(?P<lat>%s)\s*,\s*(?P<lon>%s)\]" % (_float, _float))
TEMP_RE = re.compile(r"🌡\s*(?P<t>%s)\s*ºC" % _float)
TEMP_MIN_RE = re.compile(r"min\s*(?P<t>%s)\s*ºC" % _float)
TEMP_MAX_RE = re.compile(r"max\s*(?P<t>%s)\s*ºC" % _float)

# варианты: "🔋 7950mV Vbus 7950mV Ibus 55mA" или "Vbus 8426mV Ibus 138mA"
VBUS_RE = re.compile(r"(?:🔋\s*)?(?:\d+\s*mV\s*)?Vbus\s*(?P<v>\d+)\s*mV", re.IGNORECASE)
IBUS_RE = re.compile(r"Ibus\s*(?P<i>[-+]?\d+)\s*mA", re.IGNORECASE)

# суммарная мощность: "☀️🧮 2049mW"
SOLAR_TOTAL_RE = re.compile(r"☀️🧮\s*(?P<p>\d+)\s*mW")

# Battery capacity: e.g. "Battery Capacity 47%", "Batt 47%", "🔋 47%"
BATTERY_CAP_RE = re.compile(
    r"(?:Battery\s*Capacity|Battery\s*Cap|Batt(?:ery)?\s*(?:Capacity|Cap)?|🔋)\s*:?\s*(?P<pct>%s)\s*%%" % _float,
    re.IGNORECASE,
)

# Solar voltage: e.g. "Solar Voltage 25000mV", "Vsolar 25000mV", "☀️ V 25000mV"
SOLAR_VOLT_RE = re.compile(
    r"(?:Solar\s*Voltage|Solar\s*V|Vsolar|Vsol|☀️\s*V)\s*:?\s*(?P<v>\d+)\s*mV",
    re.IGNORECASE,
)

# "📞📶 RSSI: -83dBm SNR:0dB"
RSSI_RE = re.compile(r"RSSI:\s*(?P<r>-?\d+)\s*dBm", re.IGNORECASE)
SNR_RE = re.compile(r"SNR:\s*(?P<s>-?\d+)\s*dB", re.IGNORECASE)

UPTIME_RE = re.compile(r"Uptime:\s*(?P<u>\d+)\s*sec", re.IGNORECASE)
RESET_RE = re.compile(r"Reset:\s*(?P<rc>\d+)", re.IGNORECASE)


def parse_tinygs_telegram(text: str) -> Optional[Parsed]:
    m = SAT_RE.search(text)
    if not m:
        return None
    raw_sat = m.group("sat").strip()
    sat = _normalize_sat(raw_sat)

    out = Parsed(satellite=sat)

    m = TLE_LOC_RE.search(text)
    if m:
        out.tle_lat = float(m.group("lat"))
        out.tle_lon = float(m.group("lon"))

    m = TEMP_RE.search(text)
    if m:
        out.temp_c = float(m.group("t"))

    m = TEMP_MIN_RE.search(text)
    if m:
        out.temp_min_c = float(m.group("t"))

    m = TEMP_MAX_RE.search(text)
    if m:
        out.temp_max_c = float(m.group("t"))

    m = VBUS_RE.search(text)
    if m:
        out.vbus_mv = int(m.group("v"))

    m = IBUS_RE.search(text)
    if m:
        out.ibus_ma = int(m.group("i"))

    m = BATTERY_CAP_RE.search(text)
    if m:
        out.battery_capacity_pct = float(m.group("pct"))

    m = SOLAR_VOLT_RE.search(text)
    if m:
        out.solar_voltage_mv = int(m.group("v"))

    m = SOLAR_TOTAL_RE.search(text)
    if m:
        out.solar_total_mw = int(m.group("p"))

    m = RSSI_RE.search(text)
    if m:
        out.rssi_dbm = int(m.group("r"))

    m = SNR_RE.search(text)
    if m:
        out.snr_db = int(m.group("s"))

    m = UPTIME_RE.search(text)
    if m:
        out.uptime_sec = int(m.group("u"))

    m = RESET_RE.search(text)
    if m:
        out.reset_count = int(m.group("rc"))

    return out