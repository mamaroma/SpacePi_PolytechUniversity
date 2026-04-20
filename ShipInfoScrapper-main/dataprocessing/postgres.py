import psycopg2
import pandas as pd
from config import host,port,dbname,user,password
import re
import glob
import shutil

pattern = r'[^\w\s]'

input_files = glob.glob('static/*.csv')  #aisdk - mode 0, AIS - mode 1
count = 0

for input_file in input_files:
    if input_file[7] == 'a':
        mode = 0
        usecols = [0,2,3,4,7,8,10,12,13,15,16,18]
        data = pd.read_csv(input_file, usecols=usecols)
        data = data.fillna(0)
        data["# Timestamp"] = pd.to_datetime(data["# Timestamp"])
        data_sorted = data.sort_values(by=["# Timestamp"])
        data = data_sorted.groupby(["MMSI", data_sorted["# Timestamp"].dt.floor("h")],as_index=False).first()
        #data.info()
        data_info = data.drop(['# Timestamp','Latitude','Longitude','SOG','COG'], axis=1).drop_duplicates(["MMSI"])
        data_info = data_info.reindex(columns=['MMSI','Name','Ship type','Length','Width','Draught','IMO'])
        data_info.info()
        data_points = data.drop(['Name','Ship type','Length','Width','Draught','IMO'], axis=1)
        data_points = data_points.reindex(columns=['MMSI','# Timestamp','Latitude','Longitude','SOG','COG'])
        data_points.info()
    else:
        mode = 1
        usecols = [0,1,2,3,4,5,7,8,10,12,13,14]
        data = pd.read_csv(input_file, usecols=usecols)
        data = data.fillna(0)
        data["BaseDateTime"] = pd.to_datetime(data["BaseDateTime"])
        data_sorted = data.sort_values(by=["BaseDateTime"])
        data = data_sorted.groupby(["MMSI", data_sorted["BaseDateTime"].dt.floor("h")],as_index=False).first()
        #data.info()
        data_info = data.drop(['BaseDateTime','LAT','LON','SOG','COG'], axis=1).drop_duplicates(["MMSI"])
        data_info = data_info.reindex(columns=['MMSI','VesselName','VesselType','Length','Width','Draft','IMO'])
        data_info.info()
        data_points = data.drop(['VesselName','VesselName','VesselType','Length','Width','Draft','IMO'], axis=1)
        data_points = data_points.reindex(columns=['MMSI','BaseDateTime','LAT','LON','SOG','COG'])
        data_points.info()
    try:
        connection = psycopg2.connect(host=host, port=port, database=dbname, user=user, password=password)
        connection.autocommit = True
        with connection.cursor() as cursor:
            for string_info in data_info.itertuples():
                vessel_name = f'{string_info[2]}'
                vessel_name = re.sub(pattern, '', vessel_name)
                imo = f'{string_info[7]}'
                imo = imo.replace("IMO", '')
                imo = imo.replace('Unknown','0')
                vessel_type = string_info[3]
                if mode == 0:
                    vessel_type = vessel_type.replace('Undefined','0')
                cursor.execute("insert into vessel_info VALUES (%s, %s, %s, %s, %s, %s, %s) ON CONFLICT (mmsi) DO NOTHING;", (string_info[1], vessel_name, vessel_type, string_info[4], string_info[5], string_info[6],imo))
                cursor.execute("insert into vessel_additional_info (mmsi) VALUES (%s) ON CONFLICT (mmsi) DO NOTHING;", (string_info[1],))
            print('Начало: data_points')
            for string_points in data_points.itertuples():
                cursor.execute("insert into vessels_points (mmsi, datetime, lat, lon, speed, course) VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT (mmsi, datetime) DO NOTHING;", (string_points[1], string_points[2] , string_points[3], string_points[4], string_points[5], string_points[6]))
            print('ФАЙЛ',input_file,'ДОБАВЛЕН В БД')
            count += 1
            print('ОБЩЕЕ КОЛИЧЕСТВО ОБРАБОТАННЫХ ФАЙЛОВ:', count)
            shutil.move(input_file, 'processed_files')
    except Exception as _ex:
        import traceback
        traceback.print_exc()
        print('error:',_ex)
    finally:
        if connection:
            connection.close()
            print('Connection closed')
