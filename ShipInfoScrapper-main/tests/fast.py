import requests
import pandas as pd
from bs4 import BeautifulSoup
from user_agent import generate_user_agent
from concurrent.futures import ThreadPoolExecutor, as_completed
import time
from stem import Signal
from stem.control import Controller
from threading import Thread
from time import sleep


input_file = "AIS_decoded.csv"

# Глобальные настройки
MAX_THREADS = 10  # Оптимальное количество потоков (можно регулировать)
TIMEOUT = 10  # Таймаут для запросов
RETRIES = 3  # Количество попыток при ошибках


# Функция для смены IP
def change_ip():
    with Controller.from_port(port=9051) as controller:
        controller.authenticate(password="spacez")  # Пароль из torrc
        controller.signal(Signal.NEWNYM)  # Команда "сменить IP"


def get_current_ip():
    response = requests.get("https://api.ipify.org?format=json", proxies=proxies)
    return response.json()['ip']


def get_session():
    session = requests.Session()
    session.headers.update({
        "User-Agent": generate_user_agent(),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
    })
    return session

def get_vessel_info(mmsi, session):
    for attempt in range(RETRIES):
        try:
            url = f"https://www.vesselfinder.com/vessels/details/{mmsi}"
            res = session.get(url, timeout=TIMEOUT)
            res.raise_for_status()
            
            soup = BeautifulSoup(res.text, features="html.parser")
            flag_table = soup.find("table", class_="aparams")
            
            if not flag_table:
                return {"mmsi": mmsi, "country": None, "photourl": None}
                
            flag_cell = flag_table.find("td", class_="n3", string='Flag')
            if flag_cell:
                country = flag_cell.find_next_sibling('td').text.strip()
            else:
                country = None
                
            photo_img = soup.find("img", class_="main-photo")
            photourl = photo_img.get("src") if photo_img else None
            
            return {"mmsi": mmsi, "country": country, "photourl": photourl}
            
        except Exception as e:
            if attempt == RETRIES - 1:
                print(f"Error processing MMSI {mmsi}: {str(e)}")
                return {"mmsi": mmsi, "country": None, "photourl": None}
            time.sleep(1)  # Задержка перед повторной попыткой

def process_vessels(data, max_workers=MAX_THREADS):
    results = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        session = get_session()
        futures = []
        
        for _, vessel in data.iterrows():
            mmsi = vessel["mmsi"]
            futures.append(executor.submit(get_vessel_info, mmsi, session))
        
        for future in as_completed(futures):
            try:
                result = future.result()
                if result.get("photourl"):
                    print(result["photourl"])
                results.append(result)
                # change_ip()
            except Exception as e:
                print(f"Error in future: {str(e)}")
    
    return pd.DataFrame(results)


def auto_update_ip():
    while True:
        change_ip()
        sleep(10)


if __name__ == "__main__":

    proxies = {
        'http': 'socks5://127.0.0.1:9050',
        'https': 'socks5://127.0.0.1:9050'
    }

    # Чтение данных
    data = pd.read_csv(input_file, sep=";")
    
    # Ограничение количества запросов для тестирования
    # data = data.head(100)  # Раскомментируйте для теста

    ip_changer = Thread(target=auto_update_ip)
    ip_changer.start()
    
    # Обработка данных
    start_time = time.time()
    result_df = process_vessels(data)
    elapsed_time = time.time() - start_time
    
    print(f"Обработано {len(result_df)} судов за {elapsed_time:.2f} секунд")
    
    # Сохранение результатов
    result_df.to_csv("vessels_info.csv", index=False)