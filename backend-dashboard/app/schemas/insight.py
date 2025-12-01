"""Pydantic schemas for AI Insights data validation."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator


class MoodDataPoint(BaseModel):
    """A single day's mood average."""
    date: str
    avg_mood_score: int = Field(ge=0, le=100)


class MoodTrends(BaseModel):
    """Mood trends over the insight period."""
    daily: List[MoodDataPoint] = Field(default_factory=list)
    trend: str = Field(pattern=r"^(improving|worsening|stable)$", default="stable")
    week_avg: float = Field(ge=0, le=100, default=0)
    prev_week_avg: Optional[float] = Field(ge=0, le=100, default=None)
    change_percent: Optional[float] = None


class Streaks(BaseModel):
    """Streak data for consecutive patterns."""
    high_stress_consecutive_days: int = Field(ge=0, default=0)
    negative_mood_consecutive_days: int = Field(ge=0, default=0)
    feel_better_no_streak: int = Field(ge=0, default=0)


class SuddenDrop(BaseModel):
    """A sudden mood drop event."""
    date: str
    from_score: int = Field(alias="from", ge=0, le=100)
    to_score: int = Field(alias="to", ge=0, le=100)
    drop: int = Field(ge=0)

    class Config:
        populate_by_name = True


class JournalTheme(BaseModel):
    """A clustered journal theme."""
    label: str
    count: int = Field(ge=0)
    examples: List[str] = Field(default_factory=list, max_length=3)


class SentimentBreakdown(BaseModel):
    """Sentiment distribution counts."""
    positive: int = Field(ge=0, default=0)
    neutral: int = Field(ge=0, default=0)
    negative: int = Field(ge=0, default=0)


class StressEnergyPatterns(BaseModel):
    """Stress and energy level distributions."""
    stress: Dict[str, int] = Field(default_factory=dict)
    energy: Dict[str, int] = Field(default_factory=dict)


class InsightMetadata(BaseModel):
    """Metadata for an insight record."""
    risk_level: str = Field(pattern=r"^(low|medium|high|critical)$", default="low")
    risk_score: int = Field(ge=0, le=25, default=0)
    risk_reasoning: str = ""
    week_avg: Optional[float] = None
    journal_count: int = Field(ge=0, default=0)
    checkin_count: int = Field(ge=0, default=0)
    alerts_count: int = Field(ge=0, default=0)
    students_analyzed: Optional[int] = Field(ge=0, default=None)
    generated_at: Optional[str] = None


class WeeklyInsightData(BaseModel):
    """Schema for weekly insight ai_insights.data JSON."""
    title: str = Field(max_length=100)
    summary: str = Field(max_length=500)
    mood_trends: MoodTrends
    dominant_emotions: List[str] = Field(default_factory=list, max_length=10)
    sentiment_breakdown: Optional[SentimentBreakdown] = None
    stress_energy_patterns: Optional[StressEnergyPatterns] = None
    streaks: Optional[Streaks] = None
    sudden_drops: List[SuddenDrop] = Field(default_factory=list)
    journal_themes: List[JournalTheme] = Field(default_factory=list, max_length=10)
    top_concerns: List[str] = Field(default_factory=list, max_length=10)
    triggers_detected: List[str] = Field(default_factory=list, max_length=10)
    what_improved: List[str] = Field(default_factory=list, max_length=5)
    what_declined: List[str] = Field(default_factory=list, max_length=5)
    recommendations: List[str] = Field(default_factory=list, min_length=0, max_length=5)
    metadata: InsightMetadata

    @field_validator('title')
    @classmethod
    def title_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError('title cannot be empty')
        return v


class BehavioralRiskFlags(BaseModel):
    """Risk flags for behavioral insights."""
    negative_sentiment_ratio_percent: float = Field(ge=0, le=100, default=0)
    high_stress_days: int = Field(ge=0, default=0)
    high_stress_streak: int = Field(ge=0, default=0)
    negative_mood_streak: int = Field(ge=0, default=0)
    feel_better_no_streak: int = Field(ge=0, default=0)
    late_night_journals: int = Field(ge=0, default=0)
    sudden_mood_drops: int = Field(ge=0, default=0)
    distress_keywords_found: int = Field(ge=0, default=0)


class BehavioralClusters(BaseModel):
    """Behavioral clustering data."""
    time_of_day: Dict[str, int] = Field(default_factory=dict)
    day_of_week: Dict[str, int] = Field(default_factory=dict)


class IrregularChange(BaseModel):
    """A day-to-day mood swing event."""
    date: str
    delta: int


class BehavioralInsightData(BaseModel):
    """Schema for behavioral insight ai_insights.data JSON."""
    recurring_emotional_patterns: List[str] = Field(default_factory=list, max_length=10)
    irregular_changes: List[IrregularChange] = Field(default_factory=list, max_length=20)
    sudden_drops: List[SuddenDrop] = Field(default_factory=list)
    risk_flags: BehavioralRiskFlags
    behavioral_clusters: BehavioralClusters
    themes: List[JournalTheme] = Field(default_factory=list)
    recommendation: str
    metadata: InsightMetadata


# API Response models
class InsightResponse(BaseModel):
    """Response model for insight API endpoints."""
    insight_id: Optional[int] = None
    user_id: Optional[int] = None
    type: str = Field(pattern=r"^(weekly|behavioral)$")
    timeframe_start: str
    timeframe_end: str
    risk_level: str = Field(pattern=r"^(low|medium|high|critical)$")
    data: Dict[str, Any]
    generated_at: Optional[str] = None


class InsightHistoryItem(BaseModel):
    """Summary item for insight history listing."""
    insight_id: int
    type: str
    timeframe_start: str
    timeframe_end: str
    risk_level: str
    title: Optional[str] = None
    generated_at: str


class InsightHistoryResponse(BaseModel):
    """Response model for insight history endpoint."""
    insights: List[InsightHistoryItem]
    total: int
    page: int
    per_page: int


# Request models
class GenerateInsightRequest(BaseModel):
    """Request model for manual insight generation."""
    user_id: Optional[int] = None
    week_start: Optional[str] = None  # YYYY-MM-DD
    week_end: Optional[str] = None    # YYYY-MM-DD
    timeframe_start: Optional[str] = None  # YYYY-MM-DD
    timeframe_end: Optional[str] = None    # YYYY-MM-DD
    insight_type: str = Field(pattern=r"^(weekly|behavioral)$", default="weekly")
