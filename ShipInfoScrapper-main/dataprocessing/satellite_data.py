import psycopg2
from config import host,port,dbname,user,password

def to_signed(bits, bit_length):
    value = int(bits, 2)
    if value >= (1 << (bit_length - 1)):
        value -= (1 << bit_length)
    return value

def decode_ais_type1(binary_str):
    if len(binary_str) < 168:
        return None
    data = {
        "type": int(binary_str[0:6], 2),
        "mmsi": int(binary_str[8:38], 2),
        "speed": int(binary_str[50:60], 2) / 10.0,
        "lon": to_signed(binary_str[61:89], 28) / 600000.0,
        "lat": to_signed(binary_str[89:116], 27) / 600000.0,
        "course": int(binary_str[116:128], 2) / 10.0
    }
    return data

def nmea_to_binary(nmea_payload):
    binary = []
    for i in nmea_payload:
        value = ord(i) - 48
        if value >= 40:
            value -= 8
        binary.append(f"{value:06b}")
    return ''.join(binary)

def parse_ais_nmea_sentence(nmea_sentence):
    nmea_sentence = nmea_sentence.split()[0]
    parts = nmea_sentence.split(',')
    if len(parts) < 7:
        raise ValueError("Неверный формат сообщения")
    payload = parts[5]
    fill_bits = int(parts[6].split('*')[0])
    binary_payload = nmea_to_binary(payload)
    if fill_bits:
        binary_payload = binary_payload[:-fill_bits]
    return decode_ais_type1(binary_payload)

if __name__ == "__main__":
    list = []
    mmsi_list = []
    with open('static/20250404124641.log', 'r') as data:
        datetime_ = '2025-04-09 04:21:49'
        for i in data:
            try:
                decoded = parse_ais_nmea_sentence(i)
                if decoded['mmsi'] not in mmsi_list:
                    mmsi_list.append(decoded['mmsi'])
                    list.append(decoded)
            except:
                continue
        try:
            connection = psycopg2.connect(host=host, port=port, database=dbname, user=user, password=password)
            connection.autocommit = True
            for sq in list:
                if sq and 'mmsi' in sq:
                    with connection.cursor() as cursor:
                        cursor.execute("insert into vessel_info VALUES (%s, %s, %s, %s, %s, %s, %s) ON CONFLICT (mmsi) DO NOTHING;", (sq['mmsi'],0,0,0,0,0,0))
                        cursor.execute("insert into vessel_additional_info (mmsi) VALUES (%s) ON CONFLICT (mmsi) DO NOTHING;", (sq['mmsi'],))
                        cursor.execute("insert into vessels_points (mmsi, datetime, lat, lon, speed, course) VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT (mmsi, datetime) DO NOTHING;",(sq['mmsi'], datetime_, sq['lat'], sq['lon'], sq['speed'], sq['course']))
        except Exception as _ex:
            import traceback
            traceback.print_exc()
            print('error:',_ex)
        finally:
            if connection:
                connection.close()
                print('Connection closed')
