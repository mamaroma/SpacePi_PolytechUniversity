#!/usr/bin/env python3
"""
Создает тестовые пролеты с актуальными датами
"""

import json
import requests
from datetime import datetime, timedelta

def create_and_send_test_passes():
    """Создает и отправляет тестовые пролеты с будущими датами."""
    
    now = datetime.now()
    
    # Создаем тестовые пролеты на ближайшие часы
    test_passes = {
        "passes": [
            {
                "satellite_name": "POLYTECH-UNIVERSE 3 (R*)",
                "aos_time": (now + timedelta(minutes=30)).isoformat(),
                "los_time": (now + timedelta(minutes=40)).isoformat(),
                "max_elevation": 45.5,
                "frequency": 436550000,
                "band": "UHF",
                "notes": "Тестовый пролет 1"
            },
            {
                "satellite_name": "POLYTECH UNIVERSE-4",
                "aos_time": (now + timedelta(hours=2)).isoformat(),
                "los_time": (now + timedelta(hours=2, minutes=8)).isoformat(),
                "max_elevation": 32.1,
                "frequency": 436550000,
                "band": "UHF", 
                "notes": "Тестовый пролет 2"
            },
            {
                "satellite_name": "POLYTECH UNIVERSE-5",
                "aos_time": (now + timedelta(hours=6)).isoformat(),
                "los_time": (now + timedelta(hours=6, minutes=12)).isoformat(),
                "max_elevation": 67.8,
                "frequency": 436550000,
                "band": "UHF",
                "notes": "Тестовый пролет 3"
            }
        ]
    }
    
    print("=" * 50)
    print("СОЗДАНИЕ ТЕСТОВЫХ ПРОЛЕТОВ")
    print("=" * 50)
    print(f"Текущее время: {now.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Создано {len(test_passes['passes'])} пролетов:")
    
    for i, pass_data in enumerate(test_passes['passes'], 1):
        aos_time = datetime.fromisoformat(pass_data['aos_time'])
        print(f"  {i}. {pass_data['satellite_name']}")
        print(f"     AOS: {aos_time.strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"     Высота: {pass_data['max_elevation']}°")
    
    # Отправляем на сервер
    try:
        print(f"\nОтправка на http://localhost:8000/api/passes...")
        response = requests.post(
            "http://localhost:8000/api/passes",
            json=test_passes,
            timeout=10
        )
        
        if response.status_code == 201:
            print("✅ УСПЕХ: Тестовые пролеты отправлены!")
            
            # Проверяем ближайший пролет
            print("\nПроверка ближайшего пролета...")
            next_response = requests.get("http://localhost:8000/api/passes/next", timeout=5)
            if next_response.status_code == 200:
                next_pass = next_response.json()
                print(f"✅ Ближайший пролет: {next_pass['satellite_name']}")
                print(f"   AOS: {next_pass['aos_time']}")
            else:
                print(f"❌ Ошибка получения ближайшего пролета: {next_response.status_code}")
                
        else:
            print(f"❌ ОШИБКА: {response.status_code}")
            print(response.text)
            
    except Exception as e:
        print(f"❌ ОШИБКА: {e}")
    
    print("=" * 50)

if __name__ == "__main__":
    create_and_send_test_passes()