from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
import pyperclip
import os
import json
import time

def fetch_raw_data_with_selenium(url):
    """
    Извлекает данные под заголовком `Raw parsed view` с указанной страницы, используя Selenium Manager.
    
    Args:
        url (str): URL страницы.
    
    Returns:
        dict: Извлеченные данные в формате JSON.
    """
    try:
        # Используем Selenium Manager для автоматического управления ChromeDriver
        options = Options()
        options.headless = True  # Работает без открытия окна браузера (опционально)
        driver = webdriver.Chrome(options=options)  # Selenium Manager автоматически подберет драйвер
        driver.get(url)
        
        # Даем странице немного времени на загрузку
        time.sleep(3)

        # Нажимаем на кнопку "Copy" для копирования данных в буфер обмена
        copy_button = driver.find_element(By.CLASS_NAME, 'jv-button')
        copy_button.click()

        # Ждем, пока данные скопируются в буфер
        time.sleep(1)

        # Получаем данные из буфера обмена
        raw_data = pyperclip.paste()

        # Закрываем браузер
        driver.quit()

        # Возвращаем данные как JSON
        return json.loads(raw_data)
    
    except Exception as e:
        print(f"Ошибка при обработке URL {url}: {e}")
        return None

def save_to_json(data, output_file):
    """
    Сохраняет данные в JSON-файл.
    
    Args:
        data (dict): Данные для сохранения.
        output_file (str): Имя файла для сохранения.
    """
    with open(output_file, "w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=4)
    print(f"Данные сохранены в {output_file}")

def process_links(input_file, output_dir, max_links):
    """
    Обрабатывает ссылки из входного JSON-файла, извлекает данные и сохраняет их.
    
    Args:
        input_file (str): Путь к входному JSON-файлу.
        output_dir (str): Директория для сохранения JSON-файлов.
        max_links (int): Максимальное количество обрабатываемых ссылок.
    """
    with open(input_file, "r", encoding="utf-8") as file:
        links = json.load(file)
    
    os.makedirs(output_dir, exist_ok=True)
    
    processed_count = 0
    for link in links:
        if processed_count >= max_links:
            break
        
        url = link["url"]
        date = link["date"].replace(" ", "_").replace(":", "-")  # Форматирование имени файла
        output_file = os.path.join(output_dir, f"{date}.json")
        print(f"Обработка ссылки: {url}")
        if os.path.exists(output_file):
            print(f"Файл уже существует и будет пропущен: {output_file}")
        else:
            raw_data = fetch_raw_data_with_selenium(url)
            if raw_data:
                save_to_json(raw_data, output_file)
                processed_count += 1
            
        
        

    print(f"Обработка завершена. Всего обработано ссылок: {processed_count}.")

if __name__ == "__main__":
    # Параметры
    INPUT_FILE = "Polytech_Universe-5_2025-01-16.json"  # Входной JSON-файл
    OUTPUT_DIR = "data"  # Директория для сохранения данных
    # Создание подпапки на основе первых 20 символов имени INPUT_FILE
    SUBFOLDER = INPUT_FILE[:19]  # Берем первые 20 символов
    OUTPUT_PATH = os.path.join(OUTPUT_DIR, SUBFOLDER)  # Путь к подпапке
    os.makedirs(OUTPUT_PATH, exist_ok=True)  # Создаем подпапку, если её нет

    print(f"Данные будут сохранены в директории: {OUTPUT_PATH}")
    
    MAX_LINKS = int(input("Введите количество ссылок для обработки: "))  # Лимит ссылок
    
    # Запуск обработки
    process_links(INPUT_FILE, OUTPUT_PATH, MAX_LINKS)

