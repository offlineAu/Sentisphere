# Thin wrapper so you can also run: uvicorn app.main:app --reload
from importlib import import_module

# Import the existing FastAPI application from the legacy entrypoint
app = import_module("main").app
