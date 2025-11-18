from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class SentimentResult(BaseModel):
    sentiment: str
    emotions: Optional[str] = None
    confidence: Optional[float] = None
    model_version: Optional[str] = None


class JournalSentimentResponse(SentimentResult):
    model_config = ConfigDict(from_attributes=True)

    journal_sentiment_id: int
    journal_id: int
    analyzed_at: datetime


class CheckinSentimentResponse(SentimentResult):
    model_config = ConfigDict(from_attributes=True)

    checkin_sentiment_id: int
    checkin_id: int
    analyzed_at: datetime
