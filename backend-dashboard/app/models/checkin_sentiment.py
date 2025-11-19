from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db.session import Base


class CheckinSentiment(Base):
    __tablename__ = "checkin_sentiment"

    checkin_sentiment_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    checkin_id: Mapped[int] = mapped_column(
        ForeignKey("emotional_checkin.checkin_id", ondelete="CASCADE"), nullable=False
    )
    sentiment: Mapped[Optional[str]] = mapped_column(String(50))
    emotions: Mapped[Optional[str]] = mapped_column(String(255))
    confidence: Mapped[Optional[float]] = mapped_column(Float)
    model_version: Mapped[Optional[str]] = mapped_column(String(50))
    analyzed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    checkin: Mapped["EmotionalCheckin"] = relationship("EmotionalCheckin", back_populates="sentiments")
