from __future__ import annotations

from typing import Dict

from app.models.emotional_checkin import EnergyLevel, MoodLevel, StressLevel

MOOD_SCORE_MAP: Dict[str, int] = {
    MoodLevel.TERRIBLE.value: 1,
    MoodLevel.BAD.value: 2,
    MoodLevel.UPSET.value: 3,
    MoodLevel.ANXIOUS.value: 4,
    MoodLevel.MEH.value: 5,
    MoodLevel.OKAY.value: 6,
    MoodLevel.GREAT.value: 7,
    MoodLevel.LOVED.value: 8,
    MoodLevel.AWESOME.value: 9,
}

ENERGY_SCORE_MAP: Dict[str, float] = {
    EnergyLevel.LOW.value: 0.33,
    EnergyLevel.MODERATE.value: 0.66,
    EnergyLevel.HIGH.value: 1.0,
}

STRESS_RELIEF_SCORE_MAP: Dict[str, float] = {
    StressLevel.NO_STRESS.value: 1.0,
    StressLevel.LOW_STRESS.value: 0.9,
    StressLevel.MODERATE.value: 0.6,
    StressLevel.HIGH_STRESS.value: 0.3,
    StressLevel.VERY_HIGH_STRESS.value: 0.1,
}

HIGH_STRESS_LEVELS = {StressLevel.HIGH_STRESS.value, StressLevel.VERY_HIGH_STRESS.value}


def mood_to_score(level: str) -> int:
    return MOOD_SCORE_MAP.get(level, 3)


def energy_to_score(level: str) -> float:
    return ENERGY_SCORE_MAP.get(level, 0.5)


def stress_to_score(level: str) -> float:
    return STRESS_RELIEF_SCORE_MAP.get(level, 0.5)
