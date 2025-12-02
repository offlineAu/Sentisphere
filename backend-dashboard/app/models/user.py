from __future__ import annotations

from datetime import datetime
from enum import Enum as PyEnum
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, DateTime, Enum, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db.session import Base

if TYPE_CHECKING:  # pragma: no cover
    from .alert import Alert
    from .appointment_log import AppointmentLog
    from .counselor_profile import CounselorProfile
    from .conversations import Conversation
    from .emotional_checkin import EmotionalCheckin
    from .journal import Journal
    from .messages import Message
    from .notification import Notification
    from .user_activity import UserActivity


class UserRole(str, PyEnum):
    student = "student"
    counselor = "counselor"

    @staticmethod
    def _missing_(value):
        if isinstance(value, str):
            value = value.lower()
            for member in UserRole:
                if member.value == value:
                    return member
        return None


class User(Base):
    __tablename__ = "user"

    user_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[Optional[str]] = mapped_column(String(100), unique=True)
    name: Mapped[Optional[str]] = mapped_column(String(100))
    role: Mapped[UserRole] = mapped_column(
        Enum(
            UserRole,
            name="user_role",
            native_enum=False,
            values_callable=lambda e: [m.value for m in e],
            validate_strings=True,
        ),
        nullable=False,
    )
    password_hash: Mapped[Optional[str]] = mapped_column(String(255))
    push_token: Mapped[Optional[str]] = mapped_column(String(255))
    nickname: Mapped[Optional[str]] = mapped_column(String(50))
    last_login: Mapped[Optional[datetime]] = mapped_column(DateTime)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="1")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    counselor_profile: Mapped[Optional["CounselorProfile"]] = relationship(
        "CounselorProfile", back_populates="user", uselist=False
    )
    journals: Mapped[List["Journal"]] = relationship("Journal", back_populates="user")
    emotional_checkins: Mapped[List["EmotionalCheckin"]] = relationship(
        "EmotionalCheckin", back_populates="user"
    )
    notifications: Mapped[List["Notification"]] = relationship("Notification", back_populates="user")
    activities: Mapped[List["UserActivity"]] = relationship("UserActivity", back_populates="user")
    alerts: Mapped[List["Alert"]] = relationship(
        "Alert", back_populates="user", foreign_keys="Alert.user_id"
    )
    assigned_alerts: Mapped[List["Alert"]] = relationship(
        "Alert", back_populates="assignee", foreign_keys="Alert.assigned_to"
    )
    conversations: Mapped[List["Conversation"]] = relationship(
        "Conversation", back_populates="initiator", foreign_keys="Conversation.initiator_user_id"
    )
    messages: Mapped[List["Message"]] = relationship("Message", back_populates="sender")
    appointment_logs: Mapped[List["AppointmentLog"]] = relationship("AppointmentLog", back_populates="user")
