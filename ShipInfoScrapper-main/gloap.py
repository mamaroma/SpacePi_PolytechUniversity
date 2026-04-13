from db_helper import db_cmd
import requests
from bs4 import BeautifulSoup
from concurrent.futures import ThreadPoolExecutor, as_completed


def get_vessels_without_additional_info_record():
    vessels = db_cmd.fetchall("SELECT vi.mmsi FROM vessel_info vi LEFT JOIN vessel_additional_info vai ON vi.mmsi = vai.mmsi WHERE vai.mmsi IS NULL")
    return vessels


def get_vessels_without_additional_info():
    vessels = db_cmd.fetchall("SELECT mmsi FROM vessel_additional_info WHERE image is NULL")
    return vessels


def add_new_additional_info_record(mmsi, image):
    db_cmd.commit("INSERT INTO vessel_additional_info (mmsi, image) VALUES (%s, %s, %s)", (mmsi, image))


def update_additional_info_record(mmsi, image):
    db_cmd.commit("UPDATE vessel_additional_info SET image = %s WHERE mmsi = %s", (image, mmsi))



def get_vessel_info(mmsi):
    url = "https://gloap.net/wp-admin/admin-ajax.php"
    
    headers = {
        "Host": "gloap.net",
        "Sec-Ch-Ua": '"Not:A-Brand";v="24", "Chromium";v="134"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Origin": "https://gloap.net",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Dest": "empty",
        "Referer": "https://gloap.net/ships/",
        "Accept-Language": "ru-RU,ru;q=0.9",
        "Priority": "u=1, i"
    }
    
    data = {
        "type": "ship",
        "page": "0",
        "_template": "owner",
        "action": "pdxgloap_base_get_apply_filters",
        "f": mmsi,
        "flag": "",
        "vessel_dwtf": "",
        "vessel_dwtt": "",
        "vessel_builtf": "",
        "vessel_builtt": "",
        "sc": "",
        "lang": "ru"
    }
    
    try:
        response = requests.post(url, headers=headers, data=data)
        response.raise_for_status()
        
        if response.json().get('res') != 'success':
            return None
            
        html_content = response.json().get('data', '')
        soup = BeautifulSoup(html_content, 'html.parser')
        
        ship_link = soup.find('a', class_='iship')
        if not ship_link:
            return None
            
        # Извлекаем название судна
        title_element = ship_link.find('h3', class_='i__title')
        ship_name = title_element.get_text(strip=True).replace('Bulk Carrier', '').strip() if title_element else None
        
        # Извлекаем IMO
        imo_element = ship_link.find('div', class_='i__more', string=lambda text: 'IMO' in text)
        imo = imo_element.get_text(strip=True).replace('IMO', '').strip() if imo_element else None
        
        # Извлекаем ссылку на фото
        img_element = ship_link.find('img', class_='iship__image')
        photo_url = img_element.get('data-src') if img_element else None
        if photo_url and not photo_url.startswith('http'):
            photo_url = f"https://gloap.net{photo_url}"
        
        # Извлекаем код страны (из флага)
        country_element = ship_link.find('div', class_='iship__country')
        country_code = None
        if country_element:
            flag_emoji = country_element.get_text(strip=True).split()[0]
            # Конвертируем эмодзи флага в код страны (пример для 🇮🇳 -> IN)
            try:
                country_code = ''.join([chr(ord(c) - 127397) for c in flag_emoji]).lower()
            except:
                country_code = None
        
        return {
            'ship_name': ship_name,
            'imo': imo,
            'photo_url': photo_url,
            'country_code': country_code,
            'mmsi': mmsi
        }
        
    except requests.exceptions.RequestException as e:
        print(f"Ошибка при выполнении запроса для MMSI {mmsi}: {e}")
        return None
    except Exception as e:
        print(f"Ошибка при парсинге данных для MMSI {mmsi}: {e}")
        return None



if __name__ == '__main__':
    vessels = get_vessels_without_additional_info()

    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = []
        for vessel in vessels:
            futures.append(executor.submit(get_vessel_info, vessel))
        
        for future in as_completed(futures):
            try:
                result = future.result()
                if result:
                    update_additional_info_record(result['mmsi'], result['photo_url'])                    
            except Exception as e:
                print(f"Error in future: {str(e)}")

