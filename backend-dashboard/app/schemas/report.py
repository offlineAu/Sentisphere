from __future__ import annotations

from typing import Dict, List

from pydantic import BaseModel, ConfigDict


class WeeklyInsights(BaseModel):
    journal_count: int
    checkin_count: int
    avg_mood_score: float
    critical_alerts: int
    notifications_sent: int


class TrendPoint(BaseModel):
    date: str
    avg_mood: float


class WellnessPoint(BaseModel):
    date: str
    energy_score: float
    stress_score: float


class JournalFrequencyPoint(BaseModel):
    date: str
    count: int


class StressSpikePoint(BaseModel):
    date: str
    count: int


class TrendSummary(BaseModel):
    mood_trends: List[TrendPoint]
    wellness_trend: List[WellnessPoint]


class MoodShiftPoint(BaseModel):
    date: str
    count: int


class AlertSeveritySummary(BaseModel):
    severity_counts: Dict[str, int]


class TrendsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    mood_trends: List[TrendPoint]
    wellness_trend: List[WellnessPoint]


class BehaviorInsightsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    journal_frequency: List[JournalFrequencyPoint]
    stress_spikes: List[StressSpikePoint]
    behavior_highlights: List[str] | None = None
    mood_shift: Dict[str, List[MoodShiftPoint] | str | None] | None = None


class AlertsSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    severity_counts: Dict[str, int]
