from sqlalchemy import Boolean, Column, DateTime, Integer, String, func
from sqlalchemy.orm import declarative_base

MobileBase = declarative_base()


class MobileUser(MobileBase):
    __tablename__ = "user"

    user_id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(100), nullable=True)
    name = Column(String(100), nullable=True)
    role = Column(String(50), nullable=False)
    password_hash = Column(String(255), nullable=True)
    nickname = Column(String(50), nullable=True, unique=True)
    last_login = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
