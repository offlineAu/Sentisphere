from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.models.user import UserRole


class UserBase(BaseModel):
    email: Optional[str] = None
    name: Optional[str] = None
    role: UserRole
    nickname: Optional[str] = None
    is_active: Optional[bool] = True


class UserCreate(UserBase):
    password_hash: Optional[str] = None


class UserUpdate(BaseModel):
    email: Optional[str] = None
    name: Optional[str] = None
    nickname: Optional[str] = None
    is_active: Optional[bool] = None
    last_login: Optional[datetime] = None


class User(UserBase):
    model_config = ConfigDict(from_attributes=True)

    user_id: int
    last_login: Optional[datetime] = None
    created_at: Optional[datetime] = None
