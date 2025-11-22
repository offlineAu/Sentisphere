from sqlalchemy.orm import declarative_base, sessionmaker

from app.db.database import engine

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)

Base = declarative_base()

from app.models import *


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
