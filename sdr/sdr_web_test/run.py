#!/usr/bin/env python3
"""
Скрипт для запуска SDR Трансляция
"""
import os
import sys
import subprocess
from pathlib import Path

def main():
    # Перейти в директорию проекта
    project_dir = Path(__file__).parent
    os.chdir(project_dir)
    
    print("🚀 Запуск SDR Трансляция...")
    print("📡 Адрес: http://localhost:8000")
    print("⏹️  Для остановки нажмите Ctrl+C")
    print("-" * 50)
    
    try:
        # Запустить сервер
        subprocess.run([
            sys.executable, "-m", "uvicorn", 
            "app.main:app", 
            "--host", "0.0.0.0", 
            "--port", "8000",
            "--reload"
        ])
    except KeyboardInterrupt:
        print("\n👋 Сервер остановлен")
    except Exception as e:
        print(f"❌ Ошибка запуска: {e}")
        return 1
    
    return 0

if __name__ == "__main__":
    sys.exit(main())