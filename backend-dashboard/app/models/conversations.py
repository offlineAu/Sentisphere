from __future__ import annotations

from datetime import datetime
from enum import Enum as PyEnum
from typing import List, Optional

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db.session import Base


class ConversationStatus(str, PyEnum):
    OPEN = "open"
    ENDED = "ended"


class Conversation(Base):
    __tablename__ = "conversations"

    conversation_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    initiator_user_id: Mapped[int] = mapped_column(
        ForeignKey("user.user_id", ondelete="CASCADE"), nullable=False
    )
    initiator_role: Mapped[str] = mapped_column(String(20), nullable=False)
    subject: Mapped[Optional[str]] = mapped_column(String(100))
    status: Mapped[ConversationStatus] = mapped_column(
        Enum(
            ConversationStatus,
            name="conversation_status",
            native_enum=False,
            values_callable=lambda e: [m.value for m in e],
            validate_strings=True,
        ),
        nullable=False,
        server_default="open",
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    last_activity_at: Mapped[Optional[datetime]] = mapped_column(DateTime)

    initiator: Mapped["User"] = relationship(
        "User", back_populates="conversations", foreign_keys=[initiator_user_id]
    )
    messages: Mapped[List["Message"]] = relationship(
        "Message", back_populates="conversation", cascade="all, delete-orphan"
    )
