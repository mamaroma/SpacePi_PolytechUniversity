"""
Тестовый декодер — ТОЛЬКО для проверяющих (judge/test_solution/).
Участникам не выдавать. Реализуйте свой decode_ais() по decoder.py.example.
"""
from ais_core.reference import universal_decoder


def decode_ais(sentence):
    """Декодирует одну AIS-строку NMEA или возвращает None."""
    return universal_decoder(sentence)
