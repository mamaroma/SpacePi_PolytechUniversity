from . import _db_cmd as db_cmd
from datetime import datetime, timedelta


def get_all_vessels_coords(datetime_data) -> list[dict]:
    """"
    Получить координаты всех судов в определенный час

    :return: Список судов
    """

    hour_start = datetime_data.replace(minute=0, second=0, microsecond=0)
    hour_end = hour_start + timedelta(hours=1) - timedelta(microseconds=1)

    data = db_cmd.fetchall("""
        SELECT vp.mmsi, vp.lat, vp.lon, vp.course, vi.type 
        FROM vessels_points vp
        LEFT JOIN vessel_info vi ON vp.mmsi = vi.mmsi
        WHERE vp.datetime BETWEEN %s AND %s
    """, (hour_start, hour_end))

    res = []
    for vessel in data:
        res.append({
            "mmsi": vessel[0],
            "lat": vessel[1],
            "lon": vessel[2],
            "course": vessel[3],
            "type": vessel[4]
        })
    
    return res


def get_vessel_info(mmsi):
    """
    Получить информацию о судне по mmsi
    """

    data = db_cmd.fetchone("SELECT mmsi, name, type, length, width, draft, imo FROM vessel_info WHERE mmsi = %s", (mmsi,))
    additional_data = db_cmd.fetchone("SELECT image FROM vessel_additional_info WHERE mmsi = %s", (mmsi,))

    return {
        "mmsi": data[0],
        "name": data[1],
        "type": data[2],
        "length": data[3],
        "width": data[4],
        "draft": data[5],
        "imo": data[6],
        "image": additional_data[0],
    }


def search_vessel(query) -> list[dict]:
    """
    Найти корабли по MMSI, IMO или названию (максимум 10 результатов)
    Возвращает основную информацию о судне и его изображение (если есть)
    
    :param query: Строка для поиска (может быть частью MMSI, IMO или названия)
    :return: Список найденных судов с информацией и изображением
    """
    
    data = db_cmd.fetchall("""
        SELECT vi.mmsi, vi.imo, vi.name, vai.image 
        FROM vessel_info vi
        LEFT JOIN vessel_additional_info vai ON vi.mmsi = vai.mmsi
        WHERE vi.mmsi::text ILIKE %s OR vi.imo::text ILIKE %s OR vi.name ILIKE %s
        LIMIT 10
    """, (f"%{query}%", f"%{query}%", f"%{query}%"))
    
    res = []
    for vessel in data:
        res.append({
            "mmsi": vessel[0],
            "imo": vessel[1],
            "name": vessel[2],
            "image": vessel[3]
        })
    
    return res


def get_vessel_points(mmsi, start, stop) -> list[dict]:
    """
    Получить все точки одного судна в определенный период времени

    :param mmsi: MMSI судна
    :param start: начало диапозона
    :param stop: конец диапозона
    :return: Список точек положений судна
    """

    data = db_cmd.fetchall("""SELECT datetime, lat, lon, speed FROM vessels_points WHERE mmsi = %s AND datetime BETWEEN %s AND %s""", (mmsi, start, stop))

    res = []
    for vessel in data:
        res.append({
            "datetime": vessel[0],
            "lat": vessel[1],
            "lon": vessel[2]
        })
    
    return res

