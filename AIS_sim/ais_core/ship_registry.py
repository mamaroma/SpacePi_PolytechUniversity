"""Справочник судов по MMSI (уровень 1 и др.)."""
SHIP_REGISTRY = {
    273291710: {"name": "NORDIC SPIRIT", "type": "Cargo"},
    273319680: {"name": "BALTIC STAR", "type": "Tanker"},
    273434590: {"name": "FINNBRIDGE", "type": "Cargo"},
    273433260: {"name": "SUOMIGRACHT", "type": "Cargo"},
    273323610: {"name": "KARELIA", "type": "Passenger"},
    211000555: {"name": "PRIMORSK TRADER", "type": "Cargo"},
}

# Зона GPS-спуфинга для уровня 4 (эталон для проверяющих)
SPOOF_ZONE_LEVEL4 = {
    "center_lat": 58.842175,
    "center_lon": 20.722961,
    "radius_nm": 4.0,
}
