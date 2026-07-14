"""Генерация заданий для онлайн-проверки на портале."""
from __future__ import annotations

from ais_core.reference import build_reference
from ais_core.simulator import AISSimulator, packet_count_for_level

LEVEL_MAX_SCORE = {1: 15, 2: 25, 3: 40, 4: 40}


def build_challenge(level: int, seed: int | None = None) -> dict:
    count = packet_count_for_level(level)
    sim = AISSimulator(level=level, num_packets=count, seed=seed)
    packets = sim.generate_packets(count_packets=count)
    input_rows = [{"timestamp": ts, "ais_sentence": pkt} for ts, pkt in packets]
    reference = build_reference(packets, level, ships_data=sim.ships_data)
    return {
        "level": level,
        "packet_count": len(input_rows),
        "input_rows": input_rows,
        "reference": reference["rows"],
    }
