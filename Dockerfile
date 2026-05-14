FROM python:3.11-slim

WORKDIR /app

# system deps for psycopg2
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY app/            ./app/
COPY telemetry_config.py .
COPY collect.py      .

# Copy SDR sub-service
COPY sdr/sdr_web_test/app/  ./sdr/sdr_web_test/app/
COPY sdr/sdr_web_test/frontend/  ./sdr/sdr_web_test/frontend/
# Ensure sdr package is importable
RUN touch sdr/__init__.py sdr/sdr_web_test/__init__.py

# Create data directories — populated at runtime via Docker volume mount
RUN mkdir -p /data \
    && mkdir -p sdr/sdr_web_test/data/recordings \
    && mkdir -p sdr/sdr_web_test/data/silence

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:8000/api/satellites || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
