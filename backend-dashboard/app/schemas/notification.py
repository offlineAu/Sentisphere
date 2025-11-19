from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class NotificationBase(BaseModel):
    message: Optional[str] = None
    type: Optional[str] = None
    is_read: Optional[bool] = False


class NotificationCreate(NotificationBase):
    user_id: Optional[int] = None


class NotificationUpdate(BaseModel):
    message: Optional[str] = None
    type: Optional[str] = None
    is_read: Optional[bool] = None


class Notification(NotificationBase):
    model_config = ConfigDict(from_attributes=True)

    notification_id: int
    user_id: Optional[int] = None
    created_at: datetime
