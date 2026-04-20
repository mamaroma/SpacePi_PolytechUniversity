import cloudscraper
from bs4 import BeautifulSoup
from time import sleep
import psycopg2
from config import host,port,dbname,user,password
import threading

headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0"}
count = 0

def print_count():
    while True:
        sleep(100)
        print(count)

print_count_thread = threading.Thread(target=print_count)
print_count_thread.start()

try:
    connection = psycopg2.connect(host=host, port=port, database=dbname, user=user, password=password)
    connection.autocommit = True
    with connection.cursor() as cursor:
        cursor.execute("select * from vessel_additional_info;")
        for stroka in cursor.fetchall():
            if not stroka[1] or stroka[1] == 'https://gloap.net/wp-content/themes/pdxtemplate/img/default/ship.png' or stroka[1] == '0':
                sleep(1)
                try:
                    scraper = cloudscraper.create_scraper()
                    response = scraper.get(f"https://www.marinetraffic.com/en/ais/details/ships/mmsi:{stroka[0]}")
                    soup = BeautifulSoup(response.text, 'html.parser')
                    photourl = soup.find(name="meta", property='og:image').get("content")
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

