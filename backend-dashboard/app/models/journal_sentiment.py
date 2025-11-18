from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db.session import Base


class JournalSentiment(Base):
    __tablename__ = "journal_sentiment"

    journal_sentiment_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    journal_id: Mapped[int] = mapped_column(ForeignKey("journal.journal_id", ondelete="CASCADE"), nullable=False)
    sentiment: Mapped[Optional[str]] = mapped_column(String(50))
    emotions: Mapped[Optional[str]] = mapped_column(String(255))
    confidence: Mapped[Optional[float]] = mapped_column(Float)
    model_version: Mapped[Optional[str]] = mapped_column(String(50))
    analyzed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    journal: Mapped["Journal"] = relationship("Journal", back_populates="sentiments")
