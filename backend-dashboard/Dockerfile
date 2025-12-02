FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8010

WORKDIR /app

# When building on Railway, the build context is the repo root and this
# Dockerfile is referenced as backend-dashboard/Dockerfile, so we must copy
# files from the backend-dashboard/ subfolder.
COPY backend-dashboard/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend-dashboard/. .

EXPOSE ${PORT}

# Render/Railway set PORT dynamically; fallback to 8010 for local dev
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8010}
