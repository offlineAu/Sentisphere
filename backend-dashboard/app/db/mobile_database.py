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
    return create_engine(MOBILE_DATABASE_URL, pool_pre_ping=True)


def initialize_mobile_database() -> None:
    url = make_url(MOBILE_DATABASE_URL)
    _ensure_database_exists(url)
    with mobile_engine.connect() as conn:  # type: ignore[name-defined]
        conn.execute(text("SELECT 1"))
        conn.execute(text(
            """
            CREATE TABLE IF NOT EXISTS `user` (
              `user_id` INT NOT NULL AUTO_INCREMENT,
              `email` VARCHAR(100) NULL,
              `name` VARCHAR(100) NULL,
              `role` VARCHAR(50) NOT NULL,
              `password_hash` VARCHAR(255) NULL,
              `nickname` VARCHAR(50) NULL,
              `last_login` DATETIME NULL,
              `is_active` TINYINT(1) NOT NULL DEFAULT 1,
              `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (`user_id`),
              UNIQUE KEY `uniq_user_nickname` (`nickname`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        ))
        conn.execute(text(
            """
            CREATE TABLE IF NOT EXISTS `conversations` (
              `conversation_id` INT NOT NULL AUTO_INCREMENT,
              `initiator_user_id` INT NOT NULL,
              `initiator_role` VARCHAR(20) NOT NULL,
              `subject` VARCHAR(100) NULL,
              `status` VARCHAR(20) NOT NULL DEFAULT 'open',
              `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              `last_activity_at` DATETIME NULL,
              PRIMARY KEY (`conversation_id`),
              KEY `idx_conversations_initiator` (`initiator_user_id`),
              CONSTRAINT `fk_conv_user` FOREIGN KEY (`initiator_user_id`) REFERENCES `user`(`user_id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        ))
        conn.execute(text(
            """
            CREATE TABLE IF NOT EXISTS `messages` (
              `message_id` INT NOT NULL AUTO_INCREMENT,
              `conversation_id` INT NOT NULL,
              `sender_id` INT NOT NULL,
              `content` TEXT NOT NULL,
              `is_read` TINYINT(1) NOT NULL DEFAULT 0,
              `timestamp` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (`message_id`),
              KEY `idx_messages_conversation` (`conversation_id`),
              KEY `idx_messages_sender` (`sender_id`),
              CONSTRAINT `fk_msg_conv` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`conversation_id`) ON DELETE CASCADE,
              CONSTRAINT `fk_msg_user` FOREIGN KEY (`sender_id`) REFERENCES `user`(`user_id`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        ))
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


mobile_engine = _create_engine()
MobileSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=mobile_engine)


def get_mobile_db() -> Generator:
    db = MobileSessionLocal()
    try:
        yield db
    finally:
        db.close()
