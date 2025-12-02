FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8010

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE ${PORT}

# Render sets PORT dynamically; fallback to 8010 for local dev
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8010}
