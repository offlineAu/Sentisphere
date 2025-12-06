from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Text, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class Message(Base):
    __tablename__ = "messages"

    message_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("conversations.conversation_id", ondelete="CASCADE"), nullable=False
    )
    sender_id: Mapped[int] = mapped_column(ForeignKey("user.user_id", ondelete="CASCADE"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="0")
    timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=text("CONVERT_TZ(NOW(), '+00:00', '+08:00')"))

    conversation: Mapped["Conversation"] = relationship("Conversation", back_populates="messages")
    sender: Mapped["User"] = relationship("User", back_populates="messages")
