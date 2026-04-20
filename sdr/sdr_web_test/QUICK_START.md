# 🚀 Быстрый старт SDR Трансляция

## Установка и запуск за 3 шага

### 1️⃣ Установить зависимости
```bash
cd sdr_web_test
pip install -r requirements.txt
```

### 2️⃣ Запустить сервер
```bash
python run.py
```

### 3️⃣ Открыть браузер
Перейти на: **http://localhost:8000**

---

## 🧪 Тестирование функций

### Запустить демо API:
```bash
# В отдельном терминале (пока сервер работает)
python demo_api.py
```

### Проверить в браузере:
1. Увидеть обновленные параметры сигнала
2. Проверить прогнозы пролетов спутников
3. Протестировать запись: **"Начать запись"** → **"Остановить запись"**

---

## 🔧 Подключение GNU Radio

### 1. Настроить IQ поток
```python
# Добавить ZMQ PUB Sink в GNU Radio Companion:
# Address: tcp://*:5555
# Type: Complex
```

### 2. Автоматическая отправка метаданных из GNU Radio

#### Готовый Python блок (скопируйте в GNU Radio Companion):

```python
import requests
from gnuradio import gr
from datetime import datetime, timedelta

class blk(gr.basic_block):
    def __init__(self,
                 center_frequency=436550000,
                 sample_rate=2048000,
                 satellite_name="NORBI"):
        
        gr.basic_block.__init__(self,
            name="SDR Metadata Sender",
            in_sig=None, out_sig=None)
        
        # Данные сигнала
        self.signal_data = {
            "fft_size": 1024, "fps": 25,
            "center_frequency": int(center_frequency),
            "sample_rate": int(sample_rate),
            "frequency": int(center_frequency),
            "bandwidth": 62.5, "spreading_factor": "SF8",
            "coding_rate": "4/6", "sync_word": "0x12",
            "preamble_length": 8, "crc_enabled": True,
            "satellite_name": str(satellite_name)
        }
        
        # Данные пролета (через 1.5 часа)
        now = datetime.now()
        aos = now + timedelta(hours=1.5)
        los = aos + timedelta(minutes=10)
        
        self.passes_data = {
            "passes": [{
                "satellite_name": str(satellite_name),
                "aos_time": aos.isoformat(),
                "los_time": los.isoformat(),
                "max_elevation": 52.3,
                "frequency": int(center_frequency),
                "band": "UHF",
                "notes": "Автоматический прогноз от GNU Radio"
            }]
        }
    
    def start(self):
        print("🚀 Отправка метаданных в SDR Трансляция...")
        
        # Отправка сигнала
        try:
            requests.post("http://localhost:8000/api/signal/info",
                         json=self.signal_data, timeout=5)
            print("✅ Параметры сигнала отправлены")
        except Exception as e:
            print(f"❌ Ошибка сигнала: {e}")
        
        # Отправка пролетов
        try:
            requests.post("http://localhost:8000/api/passes",
                         json=self.passes_data, timeout=5)
            print("✅ Прогнозы пролетов отправлены")
        except Exception as e:
            print(f"❌ Ошибка пролетов: {e}")
        
        return super().start()
```

#### Как использовать:
1. Создайте Python Block в GNU Radio Companion
2. Скопируйте код выше в поле "Code"  
3. Настройте параметры: center_frequency, sample_rate, satellite_name
4. Запустите flowgraph - метаданные отправятся автоматически

---

## 📡 Отправка параметров сигнала

### Пример LoRa сигнала:
```bash
curl -X POST "http://localhost:8000/api/signal/info" \
     -H "Content-Type: application/json" \
     -d '{
       "fft_size": 1024,
       "fps": 25,
       "center_frequency": 436550000,
       "sample_rate": 2048000,
       "frequency": 436550000,
       "bandwidth": 62.5,
       "spreading_factor": "SF8",
       "coding_rate": "4/6",
       "sync_word": "0x12",
       "preamble_length": 8,
       "crc_enabled": true
     }'
```

### Прогнозы пролетов:
```bash
curl -X POST "http://localhost:8000/api/passes" \
     -H "Content-Type: application/json" \
     -d '{
       "passes": [{
         "satellite_name": "NORBI",
         "aos_time": "2024-12-20T15:30:00",
         "los_time": "2024-12-20T15:40:00",
         "max_elevation": 52.3,
         "frequency": 436550000
       }]
     }'
```

---

## 📁 Файлы записи

Записи сохраняются в: `data/recordings/YYYYMMDD_HHMMSS.iq`

Чтение в Python:
```python
import numpy as np
iq_data = np.fromfile('20241220_153045.iq', dtype=np.complex64)
```

---

## ⚡ Горячие клавиши

- **Ctrl+C** - остановить сервер
- **F5** - обновить браузер  
- **Ctrl+Shift+I** - открыть DevTools для отладки WebSocket

---

## 🆘 Проблемы?

1. **Сервер не запускается** → Проверить `pip install -r requirements.txt`
2. **WebSocket не работает** → Обновить браузер, проверить порт 8000
3. **Нет данных в спектрограмме** → Проверить подключение GNU Radio
4. **GNU Radio не подключается** → Проверить ZMQ адрес `tcp://localhost:5555`

**Полная документация**: `README.md`

---

## 🤖 Полная автоматизация

### Запуск всей системы:

1. **Запустить SDR Трансляция**:
   ```bash
   python run.py
   ```

2. **Запустить автоматические скрипты** (в отдельных терминалах):
   ```bash
   # Автоматическое обновление параметров сигнала
   python signal_updater.py
   
   # Автоматическое обновление прогнозов пролетов
   python satellite_tracker.py
   ```

3. **Запустить GNU Radio**:
   ```bash
   gnuradio-companion your_flowgraph.grc
   ```

4. **Проверить результат**:
   - Открыть http://localhost:8000
   - Увидеть автоматически обновляемые данные
   - Наблюдать спектрограмму в реальном времени

### Создание единого скрипта автоматизации:

```python
# auto_sdr_system.py
import subprocess
import time
import sys
from pathlib import Path

def start_sdr_system():
    """Запуск полной SDR системы"""
    
    processes = []
    
    try:
        # 1. Запустить SDR Трансляция
        print("🚀 Запуск SDR Трансляция...")
        sdr_process = subprocess.Popen([
            sys.executable, "run.py"
        ])
        processes.append(sdr_process)
        
        # Подождать запуска сервера
        time.sleep(3)
        
        # 2. Запустить обновление параметров сигнала
        print("📡 Запуск автоматического обновления сигнала...")
        signal_process = subprocess.Popen([
            sys.executable, "signal_updater.py"
        ])
        processes.append(signal_process)
        
        # 3. Запустить обновление прогнозов пролетов
        print("🛰️ Запуск автоматического обновления пролетов...")
        passes_process = subprocess.Popen([
            sys.executable, "satellite_tracker.py"
        ])
        processes.append(passes_process)
        
        print("✅ Система запущена!")
        print("🌐 Откройте http://localhost:8000")
        print("📡 Запустите GNU Radio для подачи IQ данных")
        print("⏹️ Нажмите Ctrl+C для остановки")
        
        # Ожидать завершения
        for process in processes:
            process.wait()
            
    except KeyboardInterrupt:
        print("\n🛑 Остановка системы...")
        for process in processes:
            process.terminate()
        print("👋 Система остановлена")

if __name__ == "__main__":
    start_sdr_system()
```