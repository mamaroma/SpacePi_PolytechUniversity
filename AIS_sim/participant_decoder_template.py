"""
Шаблон пользовательского декодера для отборочного этапа.

Переименуйте файл в participant_decoder.py и реализуйте decode_packets().
"""


def decode_packets(rows):
    """
    rows: list[dict], ожидаемые ключи:
      - timestamp
      - ais_sentence

    вернуть list[dict] со столбцами:
      - mmsi
      - lat
      - lon
      - speed
      - last_seen
    """
    result = []
    for row in rows:
        # TODO: реализуйте собственный декодер.
        # Ниже только пустая заготовка для формата результата.
        _ = row.get("ais_sentence", "")
        # result.append({
        #     "mmsi": 0,
        #     "lat": 0.0,
        #     "lon": 0.0,
        #     "speed": 0.0,
        #     "last_seen": row.get("timestamp", ""),
        # })
    return result
