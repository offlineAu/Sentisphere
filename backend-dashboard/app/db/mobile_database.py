from typing import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.engine.url import make_url
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

MOBILE_DATABASE_URL = (
    f"{settings.MOBILE_DB_DRIVER}://{settings.MOBILE_DB_USER}:{settings.MOBILE_DB_PASS}"
    f"@{settings.MOBILE_DB_HOST}:{settings.MOBILE_DB_PORT}/{settings.MOBILE_DB_NAME}"
)


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
    url = make_url(MOBILE_DATABASE_URL)
    _ensure_database_exists(url)
    eng = create_engine(MOBILE_DATABASE_URL, pool_pre_ping=True)
    # sanity check
    with eng.connect() as conn:
        conn.execute(text("SELECT 1"))
        # Ensure required tables exist for mobile features
        conn.execute(text(
            """
            CREATE TABLE IF NOT EXISTS `journal` (
              `journal_id` INT NOT NULL AUTO_INCREMENT,
              `user_id` INT NOT NULL,
              `content` TEXT NOT NULL,
              `created_at` DATETIME NOT NULL,
              `deleted_at` DATETIME NULL,
              PRIMARY KEY (`journal_id`),
              KEY `idx_journal_user_created` (`user_id`, `created_at`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        ))
        conn.execute(text(
            """
            CREATE TABLE IF NOT EXISTS `emotional_checkin` (
              `checkin_id` INT NOT NULL AUTO_INCREMENT,
              `user_id` INT NOT NULL,
              `mood_level` VARCHAR(50) NOT NULL,
              `energy_level` VARCHAR(50) NOT NULL,
              `stress_level` VARCHAR(50) NOT NULL,
              `comment` TEXT NULL,
              `created_at` DATETIME NOT NULL,
              PRIMARY KEY (`checkin_id`),
              KEY `idx_checkin_user_created` (`user_id`, `created_at`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        ))
    return eng


mobile_engine = _create_engine()
MobileSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=mobile_engine)


def get_mobile_db() -> Generator:
    db = MobileSessionLocal()
    try:
        yield db
    finally:
        db.close()
