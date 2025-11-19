from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db.session import Base


class Journal(Base):
    __tablename__ = "journal"

    journal_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("user.user_id", ondelete="SET NULL"))
    content: Mapped[Optional[str]] = mapped_column(Text)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    user: Mapped[Optional["User"]] = relationship("User", back_populates="journals")
    sentiments: Mapped[List["JournalSentiment"]] = relationship(
        "JournalSentiment", back_populates="journal", cascade="all, delete-orphan"
    )
