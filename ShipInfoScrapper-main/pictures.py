import requests
from bs4 import BeautifulSoup
from time import sleep
import psycopg2
from config import host,port,dbname,user,password
import threading

headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0"}
count = 0

def print_count():
    while True:
        sleep(1000)
        print(count)

print_count_thread = threading.Thread(target=print_count)
print_count_thread.start()

try:
    connection = psycopg2.connect(host=host, port=port, database=dbname, user=user, password=password)
    connection.autocommit = True
    with connection.cursor() as cursor:
        cursor.execute("select * from vessel_additional_info;")
        for stroka in cursor.fetchall():
            if not stroka[1] or stroka[1] == 'https://gloap.net/wp-content/themes/pdxtemplate/img/default/ship.png':
                sleep(5)
                response = requests.get(url=f'https://www.vesselfinder.com/vessels/details/{stroka[0]}', headers=headers)
                soup = BeautifulSoup(response.text, features="lxml")
                try:
                    photourl = soup.find(name="img", class_="main-photo").get("src")
                except:
                    pass
                    photourl = 0
                cursor.execute("UPDATE vessel_additional_info SET image = %s WHERE mmsi = %s;", (photourl, stroka[0]))
                count += 1
except Exception as _ex:
    print('error:',_ex)
finally:
    if connection:
        connection.close()
        print('Connection closed')

