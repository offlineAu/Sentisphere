from __future__ import annotations

from datetime import datetime
from typing import Optional
from enum import Enum as PyEnum

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db.session import Base


class NotificationCategory(str, PyEnum):
    """Categories for notifications"""
    DAILY_QUOTE = "daily_quote"
    WELLNESS_REMINDER = "wellness_reminder"
    SYSTEM = "system"
    COUNSELOR_MESSAGE = "counselor_message"
    INSIGHT = "insight"
    OTHER = "other"


class NotificationSource(str, PyEnum):
    """Sources that can generate notifications"""
    SCHEDULER = "scheduler"
    ALERT_TRIGGER = "alert_trigger"
    MANUAL = "manual"
    SYSTEM = "system"


class Notification(Base):
    """
    Unified notification table for all push notifications:
    - Daily motivational quotes (scheduler-based)
    - High-risk wellness reminders (alert-triggered)
    - System messages
    - Counselor messages
    - Insights
    """
    __tablename__ = "notification"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("user.user_id", ondelete="CASCADE"), nullable=False)
    title: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    
    category: Mapped[NotificationCategory] = mapped_column(
        Enum(
            NotificationCategory,
            name="notification_category",
            native_enum=False,
            values_callable=lambda x: [e.value for e in x],
            validate_strings=True,
        ),
        nullable=False
    )
    source: Mapped[NotificationSource] = mapped_column(
        Enum(
            NotificationSource,
            name="notification_source",
            native_enum=False,
            values_callable=lambda x: [e.value for e in x],
            validate_strings=True,
        ),
        nullable=False
    )
    
    # Link to alert for wellness reminders
    related_alert_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("alert.alert_id", ondelete="SET NULL"),
        nullable=True
    )
    
    # Delivery status
    is_sent: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="0")
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    
    # Read status
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="0")
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    # Relationships
    user: Mapped[Optional["User"]] = relationship("User", back_populates="notifications")
    related_alert: Mapped[Optional["Alert"]] = relationship("Alert", foreign_keys=[related_alert_id])
