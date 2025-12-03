from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.user import User


class JournalBase(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    deleted_at: Optional[datetime] = None


class JournalCreate(JournalBase):
    user_id: Optional[int] = None


class JournalUpdate(JournalBase):
    pass


class Journal(JournalBase):
    model_config = ConfigDict(from_attributes=True)

    journal_id: int
    user_id: Optional[int] = None
    created_at: datetime
    sentiments: List["JournalSentiment"] = Field(default_factory=list)
    user: Optional[User] = None


class JournalSentimentBase(BaseModel):
    sentiment: Optional[str] = None
    emotions: Optional[str] = None
    confidence: Optional[float] = None
    model_version: Optional[str] = None


class JournalSentimentCreate(JournalSentimentBase):
    journal_id: int


class JournalSentiment(JournalSentimentBase):
    model_config = ConfigDict(from_attributes=True)

    journal_sentiment_id: int
    journal_id: int
    analyzed_at: datetime
