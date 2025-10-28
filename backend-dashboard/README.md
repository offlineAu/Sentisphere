# Sentisphere Backend Dashboard (FastAPI)

## Prerequisites
- Python 3.11+
- MySQL 8 (or use docker-compose)

## Setup
1. Copy `.env.example` to `.env` and adjust values.
2. Create and activate a virtualenv, then install dependencies:
```
pip install -r requirements.txt
```
3. Run the API:
```
uvicorn main:app --reload --port 8001
```

## Docker
Build and run via compose:
```
docker compose up --build
```
API at http://localhost:8001

## Health
- `GET /health` checks DB connectivity.

## Notes
- Auth token endpoint: `POST /api/auth/token` (demo only).
- Set `FRONTEND_ORIGIN` in `.env` for CORS.
