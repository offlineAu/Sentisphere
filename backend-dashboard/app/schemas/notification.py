from __future__ import annotations

from datetime import datetime
from typing import Optional, List
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class NotificationCategoryEnum(str, Enum):
    """Categories for notifications"""
    DAILY_QUOTE = "daily_quote"
    WELLNESS_REMINDER = "wellness_reminder"
    SYSTEM = "system"
    COUNSELOR_MESSAGE = "counselor_message"
    INSIGHT = "insight"
    OTHER = "other"


class NotificationSourceEnum(str, Enum):
    """Sources that can generate notifications"""
    SCHEDULER = "scheduler"
    ALERT_TRIGGER = "alert_trigger"
    MANUAL = "manual"
    SYSTEM = "system"


class NotificationBase(BaseModel):
    """Base schema for notifications"""
    title: Optional[str] = Field(None, max_length=150)
    message: str
    category: NotificationCategoryEnum
    source: NotificationSourceEnum
    related_alert_id: Optional[int] = None


class NotificationCreate(NotificationBase):
    """Schema for creating a new notification"""
    user_id: int


class NotificationUpdate(BaseModel):
    """Schema for updating a notification"""
    title: Optional[str] = None
    message: Optional[str] = None
    is_sent: Optional[bool] = None
    sent_at: Optional[datetime] = None
    is_read: Optional[bool] = None
    read_at: Optional[datetime] = None


class NotificationRead(NotificationBase):
    """Schema for reading a notification (API response)"""
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    is_sent: bool
    sent_at: Optional[datetime] = None
    is_read: bool
    read_at: Optional[datetime] = None
    created_at: datetime


class NotificationMarkRead(BaseModel):
    """Schema for marking notification as read"""
    is_read: bool = True


class NotificationListResponse(BaseModel):
    """Response schema for listing notifications"""
    notifications: List[NotificationRead]
    total: int


# Legacy alias for backwards compatibility
class Notification(NotificationRead):
    """Alias for NotificationRead (backwards compatibility)"""
    pass
