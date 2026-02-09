from telethon import TelegramClient
import asyncio
import time
import os
import re
import json
from datetime import datetime
from telemetry_config import API_ID, API_HASH

async def get_channel_info(channel_name):
    """
    Получает информацию о канале по имени или ссылке.

    Args:
        channel_name (str): Имя или ссылка на канал.

    Returns:
        dict: Словарь с названием, ID и объектом сущности канала, или None, если канал недоступен.
    """
    async with TelegramClient('session_name', API_ID, API_HASH) as client:
        try:
            entity = await client.get_entity(channel_name)
            return {"name": entity.title, "id": entity.id, "entity": entity}
        except Exception as e:
            print(f"Ошибка при получении информации о канале: {e}")
            return None


def load_existing_links(output_file):
    """
    Загружает уже существующие ссылки из файла.

    Args:
        output_file (str): Имя файла.

    Returns:
        set: Множество уникальных ссылок.
    """
    if os.path.exists(output_file):
        with open(output_file, "r") as file:
            return {line.strip().split(" ")[0] for line in file.readlines()}
    return set()

def save_links_to_file(links, output_file):
    """
    Сохраняет ссылки в файл, добавляя новые ссылки и сортируя их по убыванию даты.

    Args:
        links (list): Список кортежей (ссылка, дата).
        output_file (str): Имя файла.
    """
    # Сортируем ссылки по убыванию даты
    links.sort(key=lambda x: x[1], reverse=True)

    with open(output_file, "w") as file:
        for link, date in links:
            file.write(f"{link} {date}\n")
    print(f"Ссылки успешно сохранены в {output_file}.")

def convert_txt_to_json(txt_file, json_file):
    """
    Преобразует файл .txt в .json.

    Args:
        txt_file (str): Имя текстового файла.
        json_file (str): Имя JSON-файла.
    """
    data = []
    if os.path.exists(txt_file):
        with open(txt_file, "r") as file:
            for line in file:
                parts = line.strip().split(" ")
                if len(parts) >= 2:
                    data.append({"url": parts[0], "date": " ".join(parts[1:])})

        with open(json_file, "w", encoding="utf-8") as json_out:
            json.dump(data, json_out, ensure_ascii=False, indent=4)
        print(f"Данные успешно сохранены в {json_file}.")

async def collect_links_from_archive(channel_entity, search_term, output_file, delay, max_records):
    """
    Собирает ссылки из архивных сообщений канала по заданному фильтру.

    Args:
        channel_entity: Объект сущности канала.
        search_term (str): Текст для поиска в сообщениях.
        output_file (str): Файл для сохранения ссылок.
        delay (int): Задержка (в секундах) между запросами для снижения нагрузки.
        max_records (int): Максимальное количество ссылок для сбора.
    """
    existing_links = load_existing_links(output_file)
    collected_links = []
    message_count = 0

    async with TelegramClient('user_session', API_ID, API_HASH) as client:
        print(f"Начинаем сбор сообщений из канала {channel_entity.id}...")

        # Итерация по сообщениям канала
        async for message in client.iter_messages(channel_entity):
            message_count += 1
            print(f"Обработка сообщения из канала: {message_count}")
            # Проверяем, содержит ли сообщение нужный текст
            if search_term in (message.message or ""):
                # print(f"Сообщение ID {message.id} содержит '{search_term}'.")
                # Проверяем наличие кнопок
                if message.buttons:
                    try:
                        # Извлекаем URL из первой кнопки
                        url = message.buttons[0][0].url
                        message_date = message.date.strftime("%Y-%m-%d %H:%M")
                        if url not in existing_links:
                            collected_links.append((url, message_date))
                            print(f"Новая ссылка: {url}, дата: {message_date}")
                    except (IndexError, AttributeError):
                        print(f"Ошибка обработки кнопки в сообщении ID {message.id}")
            # Проверяем лимит на количество ссылок
            # Проверяем лимит на количество ссылок
            if len(collected_links) >= max_records:
                print(f"Достигнут лимит в {max_records} ссылок.")
                break

            # Задержка между запросами
            time.sleep(delay)
        
        # Сохраняем ссылки
        all_links = list(existing_links) + collected_links
        save_links_to_file(all_links, output_file)

    print(f"Сбор завершен. Обработано сообщений: {message_count}. Найдено новых ссылок: {len(collected_links)}.")
    # Преобразуем TXT в JSON
    convert_txt_to_json(OUTPUT_FILE, JSON_FILE)

async def collect_links_in_time_range(channel_entity, search_term, output_file, json_file,
                                      input_time_analysis, output_time_analysis, delay, max_records, process_flag):
    """Собирает ссылки за указанный диапазон времени."""
    existing_links = load_existing_links(output_file)
    collected_links = []
    processed_messages = 0
    message_count = 0

    async with TelegramClient('user_session', API_ID, API_HASH) as client:
        print(f"Начинаем сбор сообщений из канала {channel_entity.id}...")

        async for message in client.iter_messages(
            channel_entity
        ):
            message_count += 1
            message_date = message.date.strftime("%Y-%m-%d %H:%M")
            print(f"Обработка сообщения №{message_count} с датой: {message_date}")

            if input_time_analysis and message.date < input_time_analysis:
                print(f"Пропуск сообщения: {message_date} < input_time_analysis")
                continue
            if output_time_analysis and message.date > output_time_analysis:
                print(f"Пропуск сообщения: {message_date} > output_time_analysis")
                break

            process_flag = message_date
            print(f"Обновлен process_flag: {process_flag}")

            if search_term in (message.message or "") and message.buttons:
                try:
                    url = message.buttons[0][0].url
                    if url not in existing_links:
                        collected_links.append((url, message_date))
                        print(f"Ссылка: {url}, дата: {message_date}")
                        processed_messages += 1
                except (IndexError, AttributeError):
                    print(f"Ошибка обработки кнопки сообщения ID {message.id}")

            

            if max_records and processed_messages >= max_records:
                print(f"Перезапуск с process_flag: {process_flag}")
                await client.disconnect()
                await asyncio.sleep(delay)
                print(f"Сбор завершен. Обработано сообщений: {message_count}. Найдено новых ссылок: {len(collected_links)}.")
                save_links_to_file(collected_links, output_file)
                convert_txt_to_json(output_file, json_file)
                return process_flag, collected_links
            
            
         # Задержка между запросами
            time.sleep(delay)

        save_links_to_file(collected_links, output_file)
        convert_txt_to_json(output_file, json_file)
    print(f"Сбор завершен. Обработано сообщений: {message_count}. Найдено новых ссылок: {len(collected_links)}.")
    return process_flag, collected_links


if __name__ == "__main__":
    # Параметры задачи
    CHANNEL_NAME = "t.me/tinyGS_Telemetry"  # Имя или ссылка на канал
    TODAY = datetime.now().strftime("%Y-%m-%d")  # Текущая дата
    
    
    
    '''
    SEARCH_TERM = "Polytech_Universe-3"  # Фильтр для поиска сообщений
    OUTPUT_FILE = "links.txt"  # Файл для сохранения ссылок
    JSON_FILE = "links.json"  # JSON-файл для сохранения ссылок
    MAX_RECORDS = 10  # Максимальное количество записей для сбора
    '''
    DELAY = 5  # Задержка между запросами (в секундах)
    
    

    
    # Получаем информацию о канале
    channel_info = asyncio.run(get_channel_info(CHANNEL_NAME))
    if channel_info is None:
        print("Не удалось получить информацию о канале. Проверьте имя и доступность канала.")
        exit(1)

    print(f"Информация о канале: {channel_info}")
    
    
    
    SEARCH_TERM = 'Polytech_Universe-5'#input("Введите ключевое слово для поиска: ").strip()  # Ключевое слово для поиска сообщений
    def sanitize_filename(filename):
        """Удаляет недопустимые символы из имени файла."""
        return re.sub(r'[\\/*?:"<>|]', "_", filename)
    NAME_TERM = sanitize_filename(SEARCH_TERM)  # Очистка ввода
    OUTPUT_FILE = f"{NAME_TERM}_{TODAY}.txt"  # Файл для сохранения ссылок
    JSON_FILE = f"{NAME_TERM}_{TODAY}.json"  # JSON-файл для сохранения ссылок
    
    mode = input("Выберите режим работы (1 - Поиск по времени, 2 - Последние записи): ").strip()
    
    # Запускаем задачу(old method)
    # asyncio.run(collect_links_from_archive(channel_info["entity"], SEARCH_TERM, OUTPUT_FILE, DELAY, MAX_RECORDS))
    process_flag = None

    if mode == "1":
        INPUT_TIME = datetime.strptime(input("Введите начальную временную метку (гггг-мм-дд чч:мм): ").strip(), "%Y-%m-%d %H:%M")
        OUTPUT_TIME = datetime.strptime(input("Введите конечную временную метку (гггг-мм-дд чч:мм): ").strip(), "%Y-%m-%d %H:%M")
        MAX_RECORDS = None
        while True:
            process_flag, collected = asyncio.run(
                collect_links_in_time_range(
                    channel_info["entity"], SEARCH_TERM, OUTPUT_FILE, JSON_FILE,
                    INPUT_TIME, OUTPUT_TIME, delay=5, max_records=MAX_RECORDS, process_flag=process_flag
                )
            )
            if not collected:
                print("Все сообщения обработаны.")
                break
    elif mode == "2":
        MAX_RECORDS = int(input("Введите количество последних записей для сбора: ").strip())
        INPUT_TIME = None
        OUTPUT_TIME = None
        asyncio.run(
            collect_links_in_time_range(
                channel_info["entity"], SEARCH_TERM, OUTPUT_FILE, JSON_FILE,
                INPUT_TIME, OUTPUT_TIME, delay=DELAY, max_records=MAX_RECORDS, process_flag=process_flag
            )
        )
    else:
        print("Неверный режим. Завершение работы.")
    
    


