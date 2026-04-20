"""
РАБОЧИЙ БЛОК-ИСТОЧНИК ДЛЯ GNU RADIO
Работает как источник данных, чтобы граф не завершался
Отправляет метаданные при запуске
"""

import requests
from gnuradio import gr
import numpy as np
from datetime import datetime, timedelta

class blk(gr.sync_block):  # Используем sync_block вместо basic_block
    def __init__(self,
                 center_frequency=433000000,
                 sample_rate=312500,
                 satellite_name="TESTPU"):
        
        gr.sync_block.__init__(self,
            name="SDR Source Block",
            in_sig=None,  # Нет входов
            out_sig=[np.complex64])  # Один выход complex64
        
        # Сохраняем параметры
        self.center_frequency = int(center_frequency)
        self.sample_rate = int(sample_rate)
        self.satellite_name = str(satellite_name)
        self.data_sent = False
        
        print("SDR источник инициализирован: {} @ {} Hz".format(
            self.satellite_name, self.center_frequency))
        print("Граф будет работать непрерывно")
    
    def start(self):
        """Отправка данных при запуске графа"""
        
        print("\n" + "=" * 50)
        print("ГРАФ ЗАПУЩЕН - ОТПРАВКА ДАННЫХ")
        print("=" * 50)
        
        try:
            # Подготовка данных сигнала
            signal_data = {
                "fft_size": 1024,
                "fps": 30,
                "center_frequency": self.center_frequency,
                "sample_rate": self.sample_rate,
                "frequency": self.center_frequency,
                "bandwidth": 62.5,
                "spreading_factor": "SF8",
                "coding_rate": "4/6",
                "sync_word": "0x12",
                "preamble_length": 8,
                "crc_enabled": True,
                "satellite_name": self.satellite_name,
                "description": "Тест будущих пролетов"
            }
            
            print("Отправка параметров сигнала...")
            response = requests.post(
                "http://localhost:8000/api/signal/info",
                json=signal_data,
                timeout=5
            )
            
            if response.status_code == 201:
                print("OK: Параметры сигнала отправлены")
                self.data_sent = True
            else:
                print("Ошибка сигнала: {}".format(response.status_code))
            
        except Exception as e:
            print("Ошибка отправки сигнала: {}".format(e))
        
        try:
            # Отправка пролетов
            now = datetime.now()
            passes_data = {
                "passes": [{
                    "satellite_name": self.satellite_name + "STS",
                    "aos_time": (now + timedelta(hours=1.5)).isoformat(),
                    "los_time": (now + timedelta(hours=1.5, minutes=10)).isoformat(),
                    "max_elevation": 52.3,
                    "frequency": self.center_frequency + 60000,
                    "band": "UHF",
                    "notes": "GNU Radio Source Block"
                }]
            }
            
            response = requests.post(
                "http://localhost:8000/api/passes",
                json=passes_data,
                timeout=5
            )
            
            if response.status_code == 201:
                print("OK: Прогнозы пролетов отправлены")
            else:
                print("Ошибка пролетов: {}".format(response.status_code))
                
        except Exception as e:
            print("Ошибка отправки пролетов: {}".format(e))
        
        if self.data_sent:
            print("УСПЕХ! Обновите http://localhost:8000")
        
        print("=" * 50)
        print("Граф работает... (Ctrl+C для остановки)")
        
        return super().start()
    
    def work(self, input_items, output_items):
        """Генерация нулевых данных для поддержания работы графа"""
        
        # Генерируем нулевые комплексные данные
        output_items[0][:] = 0.0 + 0.0j
        
        return len(output_items[0])
    
    def stop(self):
        """Остановка блока"""
        print("Граф остановлен")
        return super().stop()