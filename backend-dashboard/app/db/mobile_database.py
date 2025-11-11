from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

MOBILE_DATABASE_URL = (
    f"{settings.MOBILE_DB_DRIVER}://{settings.MOBILE_DB_USER}:{settings.MOBILE_DB_PASS}"
    f"@{settings.MOBILE_DB_HOST}:{settings.MOBILE_DB_PORT}/{settings.MOBILE_DB_NAME}"
)

mobile_engine = create_engine(MOBILE_DATABASE_URL, pool_pre_ping=True)
MobileSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=mobile_engine)


def get_mobile_db() -> Generator:
    db = MobileSessionLocal()
    try:
        yield db
    finally:
        db.close()
