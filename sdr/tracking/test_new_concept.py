#!/usr/bin/env python3
"""
Тестовый скрипт для проверки новой концепции SDR сервиса
"""

import requests
import json
from datetime import datetime, timedelta

def test_new_concept():
    """Тестирует новую концепцию с данными спутников на сервере."""
    
    base_url = "http://localhost:8000/api"
    
    print("=" * 60)
    print("ТЕСТ НОВОЙ КОНЦЕПЦИИ SDR СЕРВИСА")
    print("=" * 60)
    
    # 1. Отправляем пролеты
    print("\n1. Отправка пролетов...")
    now = datetime.now()
    passes_data = {
        "passes": [
            {
                "satellite_name": "POLYTECH-UNIVERSE 3 (R*)",
                "aos_time": (now + timedelta(hours=1)).isoformat(),
                "los_time": (now + timedelta(hours=1, minutes=10)).isoformat(),
                "max_elevation": 45.5,
                "frequency": 436550000,
                "band": "UHF",
                "notes": "Тестовый пролет"
            },
            {
                "satellite_name": "POLYTECH UNIVERSE-4",
                "aos_time": (now + timedelta(hours=2)).isoformat(),
                "los_time": (now + timedelta(hours=2, minutes=8)).isoformat(),
                "max_elevation": 32.1,
                "frequency": 436550000,
                "band": "UHF",
                "notes": "Второй тестовый пролет"
            }
        ]
    }
    
    try:
        response = requests.post(f"{base_url}/passes", json=passes_data, timeout=5)
        if response.status_code == 201:
            print("✅ Пролеты отправлены успешно")
        else:
            print(f"❌ Ошибка отправки пролетов: {response.status_code}")
            print(response.text)
    except Exception as e:
        print(f"❌ Ошибка: {e}")
    
    # 2. Отправляем параметры спектра
    print("\n2. Отправка параметров спектра...")
    spectrum_params = {
        "center_frequency": 436610000,  # 436550000 + 60000
        "sample_rate": 312500,
        "fft_size": 1024,
        "fps": 30
    }
    
    try:
        response = requests.post(f"{base_url}/spectrum/params", json=spectrum_params, timeout=5)
        if response.status_code == 201:
            print("✅ Параметры спектра отправлены успешно")
        else:
            print(f"❌ Ошибка отправки параметров: {response.status_code}")
            print(response.text)
    except Exception as e:
        print(f"❌ Ошибка: {e}")
    
    # 3. Получаем информацию о сигнале (должна объединить данные спутника + спектр)
    print("\n3. Получение информации о сигнале...")
    try:
        response = requests.get(f"{base_url}/signal/info", timeout=5)
        if response.status_code == 200:
            signal_info = response.json()
            print("✅ Информация о сигнале получена:")
            print(f"   Спутник: {signal_info.get('satellite_name')}")
            print(f"   Частота спутника: {signal_info.get('frequency', 0)/1e6:.3f} МГц")
            print(f"   Центральная частота: {signal_info.get('center_frequency', 0)/1e6:.3f} МГц")
            print(f"   Частота дискретизации: {signal_info.get('sample_rate', 0)/1000:.1f} кГц")
            print(f"   Полоса пропускания: {signal_info.get('bandwidth')} кГц")
            print(f"   Spreading Factor: {signal_info.get('spreading_factor')}")
            print(f"   Coding Rate: {signal_info.get('coding_rate')}")
            print(f"   FFT размер: {signal_info.get('fft_size')}")
            print(f"   FPS: {signal_info.get('fps')}")
        else:
            print(f"❌ Ошибка получения сигнала: {response.status_code}")
            print(response.text)
    except Exception as e:
        print(f"❌ Ошибка: {e}")
    
    # 4. Получаем ближайший пролет
    print("\n4. Получение ближайшего пролета...")
    try:
        response = requests.get(f"{base_url}/passes/next", timeout=5)
        if response.status_code == 200:
            next_pass = response.json()
            print("✅ Ближайший пролет:")
            print(f"   Спутник: {next_pass.get('satellite_name')}")
            print(f"   AOS: {next_pass.get('aos_time')}")
            print(f"   LOS: {next_pass.get('los_time')}")
            print(f"   Макс. высота: {next_pass.get('max_elevation')}°")
        else:
            print(f"❌ Ошибка получения пролета: {response.status_code}")
            print(response.text)
    except Exception as e:
        print(f"❌ Ошибка: {e}")
    
    # 5. Получаем данные спутников
    print("\n5. Получение данных спутников...")
    try:
        response = requests.get(f"{base_url}/satellites", timeout=5)
        if response.status_code == 200:
            satellites = response.json()
            print("✅ Данные спутников:")
            for sat_name, sat_data in satellites.items():
                print(f"   {sat_name}: {sat_data.get('frequency', 0)/1e6:.3f} МГц")
        else:
            print(f"❌ Ошибка получения спутников: {response.status_code}")
            print(response.text)
    except Exception as e:
        print(f"❌ Ошибка: {e}")
    
    print("\n" + "=" * 60)
    print("ТЕСТ ЗАВЕРШЕН")
    print("Откройте http://localhost:8000 для проверки интерфейса")
    print("=" * 60)

if __name__ == "__main__":
    test_new_concept()