from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models.emotional_checkin import EnergyLevel, MoodLevel, StressLevel


class EmotionalCheckinBase(BaseModel):
    mood_level: MoodLevel
    energy_level: EnergyLevel
    stress_level: StressLevel
    comment: Optional[str] = None


class EmotionalCheckinCreate(EmotionalCheckinBase):
    user_id: Optional[int] = None


class EmotionalCheckinUpdate(BaseModel):
    comment: Optional[str] = None
    mood_level: Optional[MoodLevel] = None
    energy_level: Optional[EnergyLevel] = None
    stress_level: Optional[StressLevel] = None


class EmotionalCheckin(EmotionalCheckinBase):
    model_config = ConfigDict(from_attributes=True)

    checkin_id: int
    user_id: Optional[int]
    created_at: datetime
    sentiments: List["CheckinSentiment"] = Field(default_factory=list)


class CheckinSentimentBase(BaseModel):
    sentiment: Optional[str] = None
    emotions: Optional[str] = None
    confidence: Optional[float] = None
    model_version: Optional[str] = None


class CheckinSentimentCreate(CheckinSentimentBase):
    checkin_id: int


class CheckinSentiment(CheckinSentimentBase):
    model_config = ConfigDict(from_attributes=True)

    checkin_sentiment_id: int
    checkin_id: int
    analyzed_at: datetime
