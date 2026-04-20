#!/usr/bin/env python3
"""
Скрипт для отправки параметров спектра на SDR сервис
Отправляет параметры FFT для правильного построения спектрограммы
"""

import requests
import sys
import json

def send_spectrum_params(
    center_frequency=436550000,
    sample_rate=625000,
    fft_size=1024,
    fps=60,
    api_url="http://localhost:8000/api/spectrum/params"
):
    """
    Отправляет параметры спектра на сервер
    
    Args:
        center_frequency: Центральная частота (спутник + 60000 Гц)
        sample_rate: Частота дискретизации (всегда 625 КГц)
        fft_size: Размер FFT
        fps: Частота обновления спектра
        api_url: URL API для отправки параметров
    """
    
    # Центральная частота = частота спутника + 60000 Гц
    actual_center_freq = center_frequency + 60000
    
    spectrum_data = {
        "center_frequency": actual_center_freq,
        "sample_rate": sample_rate,
        "fft_size": fft_size,
        "fps": fps
    }
    
    print("=" * 50)
    print("ОТПРАВКА ПАРАМЕТРОВ СПЕКТРА")
    print("=" * 50)
    print(f"Частота спутника: {center_frequency/1e6:.3f} МГц")
    print(f"Центральная частота: {actual_center_freq/1e6:.3f} МГц (+60 кГц)")
    print(f"Частота дискретизации: {sample_rate/1000:.1f} кГц")
    print(f"Размер FFT: {fft_size}")
    print(f"FPS: {fps}")
    print(f"API URL: {api_url}")
    print("-" * 50)
    
    try:
        response = requests.post(api_url, json=spectrum_data, timeout=10)
        
        if response.status_code in [200, 201]:
            print("✅ УСПЕХ: Параметры спектра отправлены!")
            try:
                result = response.json()
                print(f"Ответ сервера: {json.dumps(result, indent=2, ensure_ascii=False)}")
            except:
                print(f"Ответ сервера: {response.text}")
        else:
            print(f"❌ ОШИБКА: {response.status_code}")
            print(f"Ответ: {response.text}")
            
    except requests.RequestException as e:
        print(f"❌ ОШИБКА СЕТИ: {e}")
    except Exception as e:
        print(f"❌ НЕОЖИДАННАЯ ОШИБКА: {e}")

if __name__ == "__main__":
    # Параметры по умолчанию
    center_freq = 436550000  # Частота спутника
    sample_rate = 625000     # 312.5 кГц
    fft_size = 1024
    fps = 60
    api_url = "http://localhost:8000/api/spectrum/params"
    
    # Парсинг аргументов командной строки
    if len(sys.argv) > 1:
        try:
            center_freq = int(float(sys.argv[1]))
        except ValueError:
            print("❌ ОШИБКА: Неверная частота спутника")
            sys.exit(1)
    
    if len(sys.argv) > 2:
        try:
            fft_size = int(sys.argv[2])
        except ValueError:
            print("❌ ОШИБКА: Неверный размер FFT")
            sys.exit(1)
    
    if len(sys.argv) > 3:
        try:
            fps = int(sys.argv[3])
        except ValueError:
            print("❌ ОШИБКА: Неверный FPS")
            sys.exit(1)
    
    if len(sys.argv) > 4:
        api_url = sys.argv[4]
    
    if len(sys.argv) == 1:
        print("Использование: python send_spectrum_params.py [частота_спутника] [fft_size] [fps] [api_url]")
        print(f"Пример: python send_spectrum_params.py 436550000 1024 30")
        print(f"По умолчанию: {center_freq} Гц, FFT={fft_size}, FPS={fps}")
        print()
    
    send_spectrum_params(center_freq, sample_rate, fft_size, fps, api_url)