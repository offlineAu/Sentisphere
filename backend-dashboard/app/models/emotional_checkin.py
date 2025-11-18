from __future__ import annotations

from datetime import datetime
from enum import Enum as PyEnum
from typing import List, Optional

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db.session import Base


class MoodLevel(str, PyEnum):
    VERY_SAD = "Very Sad"
    SAD = "Sad"
    NEUTRAL = "Neutral"
    GOOD = "Good"
    HAPPY = "Happy"
    VERY_HAPPY = "Very Happy"
    EXCELLENT = "Excellent"


class EnergyLevel(str, PyEnum):
    VERY_LOW = "Very Low"
    LOW = "Low"
    MODERATE = "Moderate"
    HIGH = "High"
    VERY_HIGH = "Very High"


class StressLevel(str, PyEnum):
    NO_STRESS = "No Stress"
    LOW_STRESS = "Low Stress"
    MODERATE = "Moderate"
    HIGH_STRESS = "High Stress"
    VERY_HIGH_STRESS = "Very High Stress"


class EmotionalCheckin(Base):
    __tablename__ = "emotional_checkin"

    checkin_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("user.user_id", ondelete="SET NULL"))
    mood_level: Mapped[MoodLevel] = mapped_column(
        Enum(MoodLevel, name="mood_level", native_enum=False), nullable=False
    )
    energy_level: Mapped[EnergyLevel] = mapped_column(
        Enum(EnergyLevel, name="energy_level", native_enum=False), nullable=False
    )
    stress_level: Mapped[StressLevel] = mapped_column(
        Enum(StressLevel, name="stress_level", native_enum=False), nullable=False
    )
    comment: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    user: Mapped[Optional["User"]] = relationship("User", back_populates="emotional_checkins")
    sentiments: Mapped[List["CheckinSentiment"]] = relationship(
        "CheckinSentiment", back_populates="checkin", cascade="all, delete-orphan"
    )
