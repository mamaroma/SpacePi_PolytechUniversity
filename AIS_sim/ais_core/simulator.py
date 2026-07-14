import datetime
import math
import random


class AISSimulator:
    def __init__(self, level=1, num_packets=20, seed=None):
        self.level = level
        self.num_packets = num_packets
        if seed is not None:
            random.seed(seed)
        self.seed = seed
        self.ships_data = self._generate_ships()

    def _get_distance_nautical_miles(self, p1, p2):
        lat1, lon1 = p1
        lat2, lon2 = p2
        mean_lat = math.radians((lat1 + lat2) / 2.0)
        delta_lat = (lat2 - lat1) * 60.0
        delta_lon = (lon2 - lon1) * 60.0 * math.cos(mean_lat)
        return math.sqrt(delta_lat**2 + delta_lon**2)

    def _base_time(self):
        if self.seed is not None:
            return datetime.datetime(2026, 1, 1, 0, 0, 0) + datetime.timedelta(
                seconds=int(self.seed) % (86400 * 30)
            )
        return datetime.datetime.now()

    def _generate_ships(self):
        ships = []
        base_time = self._base_time()

        if self.level == 1:
            real_mmsi_list = [273291710, 273319680, 273434590, 273433260, 273323610]
            for mmsi in real_mmsi_list:
                lat = random.uniform(60.0, 60.15)
                lon = random.uniform(28.4, 29.6)
                speed = random.uniform(8.0, 15.0)
                course = random.randint(0, 359)

                if random.random() < 0.20:
                    error_type = random.choice(["lat", "lon", "speed", "all"])
                    if error_type == "lat":
                        lat = 91.0 + random.random()
                    elif error_type == "lon":
                        lon = 181.0 + random.random()
                    elif error_type == "speed":
                        speed = -random.uniform(5, 10)
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
                (60.609890, 28.532181),
                (60.573476, 28.490295),
                (60.578536, 28.422318),
                (60.556266, 28.373566),
                (60.459926, 28.259583),
                (60.283408, 28.144226),
                (60.144239, 28.336487),
                (60.037417, 28.542480),
                (60.042904, 28.984680),
                (60.074433, 29.338989),
                (60.095493, 29.382248),
                (60.099772, 29.469795),
                (60.100628, 29.507217),
                (60.004307, 29.649696),
                (59.992977, 29.684372),
                (59.991775, 29.690552),
                (59.991196, 29.694500),
                (59.991046, 29.696345),
                (59.990616, 29.697976),
                (59.990058, 29.701281),
                (59.988599, 29.706430),
                (59.948821, 29.807281),
                (59.934032, 29.927444),
                (59.910632, 30.004349),
                (59.902024, 30.068207),
                (59.902067, 30.089064),
                (59.901637, 30.098505),
                (59.900389, 30.106487),
                (59.897031, 30.122538),
                (59.894577, 30.134382),
                (59.890487, 30.155153),
                (59.888808, 30.162792),
                (59.884846, 30.167599),
                (59.883468, 30.169230),
            ]

            current_time = base_time
            for i in range(len(points)):
                lat, lon = points[i]

                if i > len(points) - 5:
                    base_speed = random.uniform(3.0, 5.0)
                elif 12 < i < 18:
                    base_speed = random.uniform(5.0, 8.0)
                else:
                    base_speed = random.uniform(14.0, 18.0)

                if i < len(points) - 1:
                    next_p = points[i + 1]
                    dy, dx = next_p[0] - lat, next_p[1] - lon
                    course = (math.degrees(math.atan2(dx, dy)) + 360) % 360
                    dist_nm = self._get_distance_nautical_miles((lat, lon), next_p)
                    hours_to_next = dist_nm / (base_speed + 0.001)
                    minutes_to_next = hours_to_next * 60.0
                else:
                    course = ships[-1]["course"] if ships else 0
                    minutes_to_next = 0

                is_corrupted = random.random() < 0.02
                final_lat = lat + 5.0 if is_corrupted else lat

                ships.append(
                    {
                        "mmsi": ghost_mmsi,
                        "lat": final_lat,
                        "lon": lon,
                        "true_lat": lat,
                        "true_lon": lon,
                        "is_corrupted": is_corrupted,
                        "speed": base_speed,
                        "course": course,
                        "timestamp": current_time.isoformat(),
                    }
                )
                current_time += datetime.timedelta(minutes=max(0.5, minutes_to_next))
            return ships

        if self.level == 3:
            # Панамский канал: 13 судов в двух параллельных фарватерах (север/юг)
            mmsi_pool = [
                373227000, 563242200, 636012629, 563279400, 370383000,
                636024917, 256430000, 374495000, 538006339, 538005697,
                563000100, 563278300, 357339000,
            ]
            # Северный фарватер (7 судов, вдоль канала с запада на восток)
            north_lons = [-79.92, -79.85, -79.78, -79.71, -79.64, -79.57, -79.50]
            north_lat = 9.15
            # Южный фарватер (6 судов)
            south_lons = [-79.90, -79.80, -79.70, -79.60, -79.50, -79.40]
            south_lat = 8.85

            idx = 0
            for lon in north_lons:
                ships.append({
                    "mmsi": mmsi_pool[idx],
                    "lat": north_lat + random.uniform(-0.02, 0.02),
                    "lon": lon + random.uniform(-0.01, 0.01),
                    "speed": round(random.uniform(10.0, 14.0), 1),
                    "course": 90,
                    "timestamp": base_time.isoformat(),
                })
                idx += 1
            for lon in south_lons:
                ships.append({
                    "mmsi": mmsi_pool[idx],
                    "lat": south_lat + random.uniform(-0.02, 0.02),
                    "lon": lon + random.uniform(-0.01, 0.01),
                    "speed": round(random.uniform(10.0, 14.0), 1),
                    "course": 90,
                    "timestamp": base_time.isoformat(),
                })
                idx += 1
            return ships

        if self.level == 4:
            # 4 судна — параллельные треки на восток, разные широты (разные «полосы»)
            fleet_configs = [
                (273111000, 58.92, 20.15, 15.0, 88),
                (273222000, 58.78, 20.12, 14.5, 88),
                (273333000, 59.06, 20.18, 12.0, 88),
                (273444000, 58.64, 20.10, 13.0, 88),
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
                d_lon = (dist_per_step_nm * math.sin(rad_course)) / (
                    60.0 * math.cos(mean_lat_rad)
                )

                for i in range(num_steps):
                    real_lat = s_lat + (d_lat * i)
                    real_lon = s_lon + (d_lon * i)

                    is_spoofed = False
                    for sz_lat, sz_lon, sz_rad_nm in spoof_zones:
                        current_dist_nm = self._get_distance_nautical_miles(
                            (real_lat, real_lon), (sz_lat, sz_lon)
                        )
                        if current_dist_nm < sz_rad_nm:
                            is_spoofed = True
                            break

                    if is_spoofed:
                        display_lat = real_lat + random.uniform(0.3, 0.6)
                        display_lon = real_lon - random.uniform(0.3, 0.6)
                    else:
                        display_lat, display_lon = real_lat, real_lon

                    ships.append(
                        {
                            "mmsi": mmsi,
                            "lat": display_lat,
                            "lon": display_lon,
                            "real_lat": real_lat,
                            "real_lon": real_lon,
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
                ts = ship["timestamp"]
                ais_msg = self._pack_to_ais(ship)
                packets.append((ts, ais_msg))
                if callback:
                    callback(len(packets))
        else:
            for i in range(count_packets):
                ship = self.ships_data[i % len(self.ships_data)]
                ts = ship["timestamp"]
                ais_msg = self._pack_to_ais(ship)

                if self.level == 1 and random.random() < 0.05:
                    ais_msg = ais_msg.replace(",", "!")

                packets.append((ts, ais_msg))
                if callback:
                    callback(len(packets))

        return packets


def count_packet_issues(packets, level):
    """Статистика для лога генерации."""
    syntax_broken = 0
    for _, pkt in packets:
        if not pkt.startswith("!AIVDM") or pkt.count("!") > 1 or "*" not in pkt:
            syntax_broken += 1
    return {"total": len(packets), "syntax_broken": syntax_broken, "level": level}


def packet_count_for_level(level):
    if level == 1:
        return 100
    if level == 2:
        return 34
    if level == 3:
        return 13
    if level == 4:
        return 60
    raise ValueError(f"Неизвестный уровень: {level}")
