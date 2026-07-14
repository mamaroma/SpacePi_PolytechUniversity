from ais_core.ship_registry import SHIP_REGISTRY, SPOOF_ZONE_LEVEL4


def universal_decoder(ais_pkt):
    try:
        if not ais_pkt.startswith("!AIVDM") or "*" not in ais_pkt:
            return None

        body_part = ais_pkt.split("*")[0]
        parts = body_part.split(",")
        if len(parts) < 6:
            return None
        payload = parts[5]

        chars = "0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVW`abcdefghijklmnopqrstuvw"
        bits = "".join(f"{chars.index(c):06b}" for c in payload)
        b = bytes([int(bits[i : i + 8], 2) for i in range(0, len(bits) - 7, 8)])

        mmsi = int.from_bytes(b[0:4], "big")
        lat = (int.from_bytes(b[4:8], "big") / 100000) - 90
        lon = (int.from_bytes(b[8:12], "big") / 100000) - 180
        speed = int.from_bytes(b[12:14], "big") / 10

        if not (0 <= mmsi <= 999999999):
            return None
        if not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
            return None
        if speed < 0:
            return None

        return {
            "mmsi": mmsi,
            "lat": round(lat, 6),
            "lon": round(lon, 6),
            "speed": round(speed, 1),
        }
    except Exception:
        return None


def reference_process_level1(packets):
    unique_mmsi = set()
    for _, pkt in packets:
        res = universal_decoder(pkt)
        if res:
            unique_mmsi.add(res["mmsi"])

    rows = []
    for mmsi in sorted(unique_mmsi):
        info = SHIP_REGISTRY.get(mmsi, {"name": "UNKNOWN", "type": "Unknown"})
        rows.append({"mmsi": mmsi, "name": info["name"], "type": info["type"]})
    return rows


def reference_process_level3(packets):
    results = []
    for ts, pkt in packets:
        res = universal_decoder(pkt)
        if res:
            res["last_seen"] = ts
            results.append(res)
    return results


def reference_from_ships_level2(ships_data):
    rows = []
    for ship in ships_data:
        if ship.get("is_corrupted"):
            continue
        rows.append(
            {
                "mmsi": ship["mmsi"],
                "lat": round(ship["true_lat"], 6),
                "lon": round(ship["true_lon"], 6),
                "speed": round(ship["speed"], 1),
                "last_seen": ship["timestamp"],
            }
        )
    return rows


def reference_from_ships_level4(ships_data):
    rows = []
    for ship in ships_data:
        rows.append(
            {
                "mmsi": ship["mmsi"],
                "lat": round(ship["real_lat"], 6),
                "lon": round(ship["real_lon"], 6),
                "speed": round(ship["speed"], 1),
                "last_seen": ship["timestamp"],
            }
        )
    return rows


def build_reference(packets, level, ships_data=None):
    extras = {}

    if level == 1:
        rows = reference_process_level1(packets)
        fields = ["mmsi", "name", "type"]
    elif level == 2:
        rows = reference_from_ships_level2(ships_data or [])
        fields = ["mmsi", "lat", "lon", "speed", "last_seen"]
    elif level == 3:
        rows = reference_process_level3(packets)
        fields = ["mmsi", "lat", "lon", "speed", "last_seen"]
    elif level == 4:
        rows = reference_from_ships_level4(ships_data or [])
        fields = ["mmsi", "lat", "lon", "speed", "last_seen"]
        extras["spoof_zone"] = SPOOF_ZONE_LEVEL4
    else:
        raise ValueError(f"Неизвестный уровень: {level}")

    return {"level": level, "fields": fields, "rows": rows, **extras}
