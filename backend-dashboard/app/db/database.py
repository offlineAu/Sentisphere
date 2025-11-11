from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.engine.url import make_url
from sqlalchemy.exc import OperationalError, ProgrammingError

from app.core.config import settings

DATABASE_URL = (
    f"{settings.DB_DRIVER}://{settings.DB_USER}:{settings.DB_PASS}"
    f"@{settings.DB_HOST}:{settings.DB_PORT}/{settings.DB_NAME}"
)

ENGINE_INIT_ERROR: Exception | None = None
ENGINE_INIT_ERROR_MSG: str | None = None


def _ensure_database_exists(url):
    database_name = url.database
    if not database_name:
        return

    server_url = url.set(database=None)
    server_engine = create_engine(server_url, isolation_level="AUTOCOMMIT", pool_pre_ping=True)
    try:
        with server_engine.connect() as conn:
            conn.execute(
                text(
                    f"CREATE DATABASE IF NOT EXISTS `{database_name}` "
                    "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
                )
            )
    finally:
        server_engine.dispose()


def _create_engine():
    url = make_url(DATABASE_URL)
    # Make sure the target schema exists before binding
    _ensure_database_exists(url)
    try:
        eng = create_engine(DATABASE_URL, pool_pre_ping=True)
        with eng.connect() as conn:
            conn.execute(text("SELECT 1"))
        return eng
    except (OperationalError, ProgrammingError) as exc:
        raise


try:
    engine = _create_engine()
except Exception as exc:  # pragma: no cover - surface initialization errors
    ENGINE_INIT_ERROR = exc
    ENGINE_INIT_ERROR_MSG = f"{exc.__class__.__name__}: {exc}"
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Dependency for FastAPI routes
from typing import Generator

def get_db() -> Generator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
