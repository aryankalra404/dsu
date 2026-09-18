# The core's honeypot, standalone, for the Docker sandbox network (the internal network can't reach the host).
# Build context: repo root (docker compose builds it).
FROM python:3.11-slim
RUN pip install --no-cache-dir fastapi uvicorn python-dotenv
WORKDIR /app
COPY core/config.py core/honeypot.py ./
COPY core/fixtures/honeypot ./fixtures/honeypot
CMD ["uvicorn", "honeypot:app", "--host", "0.0.0.0", "--port", "8000"]
