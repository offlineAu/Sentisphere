"""
=============================================================================
UNIFIED DATABASE MODULE
=============================================================================
This is the SINGLE source of truth for database connections in Sentisphere.
Both web dashboard and mobile app use this unified engine.

As of December 2024, there is NO separate mobile database.
All operations use this shared engine and session factory.
=============================================================================
"""

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.engine.url import make_url
from sqlalchemy.exc import OperationalError, ProgrammingError

from app.core.config import settings

# =============================================================================
# UNIFIED DATABASE URL
# Uses settings.unified_db_url which reads from environment variables.
# Local dev: uses .env file (DB_HOST=127.0.0.1)
# Production: uses Railway env vars (DB_HOST=mysql.railway.internal)
# =============================================================================
DATABASE_URL = settings.unified_db_url

ENGINE_INIT_ERROR: Exception | None = None
ENGINE_INIT_ERROR_MSG: str | None = None


def _ensure_database_exists(url):
    """Create database if it doesn't exist (for local development)."""
    database_name = url.database
    if not database_name:
        return

    server_url = (
        f"{url.drivername}://{url.username}:{(url.password or '')}"
        f"@{url.host}:{url.port}"
    )
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
    """Create the unified SQLAlchemy engine."""
    return create_engine(DATABASE_URL, pool_pre_ping=True)


# =============================================================================
# UNIFIED ENGINE (single instance for entire application)
# =============================================================================
try:
    engine = _create_engine()
except Exception as exc:  # pragma: no cover - surface initialization errors
    ENGINE_INIT_ERROR = exc
    ENGINE_INIT_ERROR_MSG = f"{exc.__class__.__name__}: {exc}"
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)

# =============================================================================
# UNIFIED SESSION FACTORY (single instance for entire application)
# =============================================================================
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Dependency for FastAPI routes
from typing import Generator

def get_db() -> Generator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def initialize_main_database() -> None:
    url = make_url(DATABASE_URL)
    _ensure_database_exists(url)
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
