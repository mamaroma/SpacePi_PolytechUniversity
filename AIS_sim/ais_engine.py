"""AIS simulator core — без GUI, используется main.py и сервером."""
from __future__ import annotations

import datetime
import math
import random


class AISSimulator:
    def __init__(self, level=1, num_packets=20, seed: int | None = None):
        self.level = level
        self.num_packets = num_packets
        self._rng = random.Random(seed)
        self.ships_data = self._generate_ships()

    def _rand(self):
        return self._rng.random()

    def _uniform(self, a, b):
        return self._rng.uniform(a, b)

    def _randint(self, a, b):
        return self._rng.randint(a, b)

    def _choice(self, seq):
        return self._rng.choice(seq)

    def _get_distance_nautical_miles(self, p1, p2):
        lat1, lon1 = p1
        lat2, lon2 = p2
        mean_lat = math.radians((lat1 + lat2) / 2.0)
        delta_lat = (lat2 - lat1) * 60.0
        delta_lon = (lon2 - lon1) * 60.0 * math.cos(mean_lat)
        return math.sqrt(delta_lat**2 + delta_lon**2)

    def _generate_ships(self):
        ships = []
        base_time = datetime.datetime.now(datetime.timezone.utc)

        if self.level == 1:
            real_mmsi_list = [273291710, 273319680, 273434590, 273433260, 273323610]
            for mmsi in real_mmsi_list:
                lat = self._uniform(60.0, 60.15)
                lon = self._uniform(28.4, 29.6)
                speed = self._uniform(8.0, 15.0)
                course = self._randint(0, 359)
                if self._rand() < 0.20:
                    error_type = self._choice(["lat", "lon", "speed", "all"])
                    if error_type == "lat":
                        lat = 91.0 + self._rand()
                    elif error_type == "lon":
                        lon = 181.0 + self._rand()
                    elif error_type == "speed":
                        speed = -self._uniform(5, 10)
                    elif error_type == "all":
                        lat, lon, speed = 99.0, 199.0, -1.0
                ships.append(
                    {
                        "mmsi": mmsi,
                        "lat": lat,
                        "lon": lon,
                        "speed": speed,
                        "course": course,
                        "timestamp": base_time.isoformat(),
                    }
                )
            return ships

        if self.level == 2:
            ghost_mmsi = 211000555
            points = [
                (60.609890, 28.532181), (60.573476, 28.490295), (60.578536, 28.422318),
                (60.556266, 28.373566), (60.459926, 28.259583), (60.283408, 28.144226),
                (60.144239, 28.336487), (60.037417, 28.542480), (60.042904, 28.984680),
                (60.074433, 29.338989), (60.095493, 29.382248), (60.099772, 29.469795),
                (60.100628, 29.507217), (60.004307, 29.649696), (59.992977, 29.684372),
                (59.991775, 29.690552), (59.991196, 29.694500), (59.991046, 29.696345),
                (59.990616, 29.697976), (59.990058, 29.701281), (59.988599, 29.706430),
                (59.948821, 29.807281), (59.934032, 29.927444), (59.910632, 30.004349),
                (59.902024, 30.068207), (59.902067, 30.089064), (59.901637, 30.098505),
                (59.900389, 30.106487), (59.897031, 30.122538), (59.894577, 30.134382),
                (59.890487, 30.155153), (59.888808, 30.162792), (59.884846, 30.167599),
                (59.883468, 30.169230),
            ]
            current_time = base_time
            for i in range(len(points)):
                lat, lon = points[i]
                if i > len(points) - 5:
                    base_speed = self._uniform(3.0, 5.0)
                elif 12 < i < 18:
                    base_speed = self._uniform(5.0, 8.0)
                else:
                    base_speed = self._uniform(14.0, 18.0)
                if i < len(points) - 1:
                    next_p = points[i + 1]
                    dy, dx = next_p[0] - lat, next_p[1] - lon
                    course = (math.degrees(math.atan2(dx, dy)) + 360) % 360
                    dist_nm = self._get_distance_nautical_miles((lat, lon), next_p)
                    minutes_to_next = (dist_nm / (base_speed + 0.001)) * 60.0
                else:
                    course = ships[-1]["course"] if ships else 0
                    minutes_to_next = 0
                final_lat = lat + 5.0 if self._rand() < 0.02 else lat
                ships.append(
                    {
                        "mmsi": ghost_mmsi,
                        "lat": final_lat,
                        "lon": lon,
                        "speed": base_speed,
                        "course": course,
                        "timestamp": current_time.isoformat(),
                    }
                )
                current_time += datetime.timedelta(minutes=max(0.5, minutes_to_next))
            return ships

        if self.level == 3:
            mmsi_pool = [
                373227000, 563242200, 636012629, 563279400, 370383000,
                636024917, 256430000, 374495000, 538006339, 538005697,
                563000100, 563278300, 357339000,
            ]
            points = [
                (8.691675, -79.549255), (8.878966, -79.426346), (8.771082, -79.364548),
                (8.881001, -79.281464), (9.501889, -79.896698), (9.447707, -79.990082),
                (9.538458, -80.134277), (9.598042, -80.006561), (9.403000, -80.109558),
                (9.466672, -80.268860), (8.684209, -79.457245), (8.864719, -79.355621),
                (8.837580, -79.341888),
            ]
            for i in range(len(points)):
                lat, lon = points[i]
                mmsi = mmsi_pool[i % len(mmsi_pool)]
                ships.append(
                    {
                        "mmsi": mmsi,
                        "lat": lat,
                        "lon": lon,
                        "speed": round(self._uniform(10.0, 18.0), 1),
                        "course": self._randint(0, 359),
                        "timestamp": base_time.isoformat(),
                    }
                )
            return ships

        if self.level == 4:
            fleet_configs = [
                (273111000, 58.945859, 21.45, 15.0, 263),
                (273222000, 58.52, 20.65, 14.5, 9),
                (273333000, 59.194219, 20.110474, 10.0, 120),
                (273444000, 59.275, 20.59, 11.2, 167),
            ]
            spoof_zones = [(58.842175, 20.722961, 4.0)]
            num_steps = 15
            time_step_minutes = 12.0
            for mmsi, s_lat, s_lon, speed, course in fleet_configs:
                ship_time = base_time
                rad_course = math.radians(course)
                dist_per_step_nm = speed * (time_step_minutes / 60.0)
                mean_lat_rad = math.radians(s_lat)
                d_lat = (dist_per_step_nm * math.cos(rad_course)) / 60.0
                d_lon = (dist_per_step_nm * math.sin(rad_course)) / (60.0 * math.cos(mean_lat_rad))
                for i in range(num_steps):
                    real_lat = s_lat + (d_lat * i)
                    real_lon = s_lon + (d_lon * i)
                    is_spoofed = False
                    for sz_lat, sz_lon, sz_rad_nm in spoof_zones:
                        if self._get_distance_nautical_miles((real_lat, real_lon), (sz_lat, sz_lon)) < sz_rad_nm:
                            is_spoofed = True
                            break
                    if is_spoofed:
                        display_lat = real_lat + self._uniform(0.3, 0.6)
                        display_lon = real_lon - self._uniform(0.3, 0.6)
                    else:
                        display_lat, display_lon = real_lat, real_lon
                    ships.append(
                        {
                            "mmsi": mmsi,
                            "lat": display_lat,
                            "lon": display_lon,
                            "speed": speed,
                            "course": course,
                            "timestamp": ship_time.isoformat(),
                            "is_actual_spoofed": is_spoofed,
                        }
                    )
                    ship_time += datetime.timedelta(minutes=time_step_minutes)
            ships.sort(key=lambda x: x["timestamp"])
            return ships

        return ships

    def _calculate_checksum(self, sentence):
        cksum = 0
        for char in sentence[1:]:
            cksum ^= ord(char)
        return f"{cksum:02X}"

    def _to_6bit_ascii(self, data):
        chars = "0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVW`abcdefghijklmnopqrstuvw"
        bit_str = "".join(f"{b:08b}" for b in data)
        res = ""
        for i in range(0, len(bit_str), 6):
            chunk = bit_str[i : i + 6].ljust(6, "0")
            res += chars[int(chunk, 2)]
        return res

    def _pack_to_ais(self, ship):
        try:
            data = bytearray(14)
            data[0:4] = int(abs(ship["mmsi"])).to_bytes(4, "big")
            data[4:8] = int((ship["lat"] + 90) * 100000).to_bytes(4, "big")
            data[8:12] = int((ship["lon"] + 180) * 100000).to_bytes(4, "big")
            data[12:14] = int(ship["speed"] * 10).to_bytes(2, "big")
            payload = self._to_6bit_ascii(data)
            body = f"AIVDM,1,1,,A,{payload},0"
            return f"!{body}*{self._calculate_checksum(body)}"
        except Exception:
            return "!AIVDM,1,1,,A,ERROR*00"

    def generate_packets(self, count_packets=10, callback=None):
        packets = []
        if self.level in [2, 4]:
            for i in range(min(count_packets, len(self.ships_data))):
                ship = self.ships_data[i]
                packets.append((ship["timestamp"], self._pack_to_ais(ship)))
                if callback:
                    callback(len(packets))
        else:
            for i in range(count_packets):
                ship = self.ships_data[i % len(self.ships_data)]
                ais_msg = self._pack_to_ais(ship)
                if self.level == 1 and self._rand() < 0.05:
                    ais_msg = ais_msg.replace(",", "!")
                packets.append((ship["timestamp"], ais_msg))
                if callback:
                    callback(len(packets))
        return packets


def universal_decoder(ais_pkt: str):
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
        return {"mmsi": mmsi, "lat": round(lat, 6), "lon": round(lon, 6), "speed": round(speed, 1)}
    except Exception:
        return None


def reference_process_level1(packets):
    unique_mmsi = set()
    for _, pkt in packets:
        res = universal_decoder(pkt)
        if res:
            unique_mmsi.add(res["mmsi"])
    return [{"mmsi": m} for m in sorted(unique_mmsi)]


def reference_process_multi_level(packets):
    results = []
    for ts, pkt in packets:
        res = universal_decoder(pkt)
        if res:
            res["last_seen"] = ts
            results.append(res)
    return results


LEVEL_COUNTS = {1: 100, 2: 34, 3: 13, 4: 60}
LEVEL_MAX_SCORE = {1: 15, 2: 25, 3: 40, 4: 40}


def build_challenge(level: int, seed: int | None = None) -> dict:
    count = LEVEL_COUNTS[level]
    sim = AISSimulator(level=level, num_packets=count, seed=seed)
    packets = sim.generate_packets(count_packets=count)
    input_rows = [{"timestamp": ts, "ais_sentence": pkt} for ts, pkt in packets]
    if level == 1:
        reference = reference_process_level1(packets)
    else:
        reference = reference_process_multi_level(packets)
    return {
        "level": level,
        "packet_count": len(input_rows),
        "input_rows": input_rows,
        "reference": reference,
    }
