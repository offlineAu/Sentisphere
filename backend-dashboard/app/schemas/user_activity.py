from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class UserActivityBase(BaseModel):
    action: Optional[str] = None
    target_type: Optional[str] = None
    target_id: Optional[int] = None
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    duration_seconds: Optional[int] = None


class UserActivityCreate(UserActivityBase):
    user_id: Optional[int] = None


class UserActivityUpdate(UserActivityBase):
    user_id: Optional[int] = None


class UserActivity(UserActivityBase):
    model_config = ConfigDict(from_attributes=True)

    activity_id: int
    user_id: Optional[int] = None
    created_at: datetime
