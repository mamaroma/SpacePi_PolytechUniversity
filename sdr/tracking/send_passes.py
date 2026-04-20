#!/usr/bin/env python3
"""
Скрипт для отправки данных пролетов на SDR сервис
Читает JSON файл с пролетами и отправляет их через API
"""

import json
import requests
import sys
from datetime import datetime

def send_passes_from_json(json_file_path, api_url="http://localhost:8000/api/passes"):
    """
    Отправляет данные пролетов из JSON файла на сервер
    
    Args:
        json_file_path: Путь к JSON файлу с пролетами
        api_url: URL API для отправки пролетов
    """
    
    try:
        # Читаем JSON файл
        with open(json_file_path, 'r', encoding='utf-8') as f:
            orbit_data = json.load(f)
        
        print(f"Загружен файл: {json_file_path}")
        print(f"Время генерации: {orbit_data.get('generated_utc', 'неизвестно')}")
        print(f"Количество пролетов: {len(orbit_data.get('passes', []))}")
        
        # Преобразуем данные в формат API
        api_passes = []
        for pass_data in orbit_data.get('passes', []):
            api_pass = {
                "satellite_name": pass_data["satellite"],
                "aos_time": pass_data["aos"],
                "los_time": pass_data["los"], 
                "max_elevation": pass_data["max_el"],
                "frequency": 436550000,  # Базовая частота спутника
                "band": "UHF",
                "notes": "Автоматический прогноз"
            }
            api_passes.append(api_pass)
        
        # Отправляем данные
        payload = {"passes": api_passes}
        
        print(f"\nОтправка {len(api_passes)} пролетов на {api_url}...")
        
        response = requests.post(api_url, json=payload, timeout=10)
        
        if response.status_code == 201:
            print("✅ УСПЕХ: Пролеты успешно отправлены!")
            print(f"Ответ сервера: {response.json()}")
        else:
            print(f"❌ ОШИБКА: {response.status_code}")
            print(f"Ответ: {response.text}")
            
    except FileNotFoundError:
        print(f"❌ ОШИБКА: Файл {json_file_path} не найден")
    except json.JSONDecodeError as e:
        print(f"❌ ОШИБКА JSON: {e}")
    except requests.RequestException as e:
        print(f"❌ ОШИБКА СЕТИ: {e}")
    except Exception as e:
        print(f"❌ НЕОЖИДАННАЯ ОШИБКА: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Использование: python send_passes.py <путь_к_json_файлу> [url_api]")
        print("Пример: python send_passes.py orbits.json")
        print("Пример: python send_passes.py orbits.json http://localhost:8000/api/passes")
        sys.exit(1)
    
    json_file = sys.argv[1]
    api_url = sys.argv[2] if len(sys.argv) > 2 else "http://localhost:8000/api/passes"
    
    send_passes_from_json(json_file, api_url)