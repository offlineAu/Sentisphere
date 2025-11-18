# Thin wrapper so you can also run: uvicorn app.main:app --reload
from importlib import import_module

app = import_module("main").app
