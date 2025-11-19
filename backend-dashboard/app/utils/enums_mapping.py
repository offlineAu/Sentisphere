from __future__ import annotations

from typing import Dict

from app.models.emotional_checkin import EnergyLevel, MoodLevel, StressLevel

MOOD_SCORE_MAP: Dict[str, int] = {
    MoodLevel.VERY_SAD.value: 1,
    MoodLevel.SAD.value: 2,
    MoodLevel.NEUTRAL.value: 3,
    MoodLevel.GOOD.value: 4,
    MoodLevel.HAPPY.value: 5,
    MoodLevel.VERY_HAPPY.value: 6,
    MoodLevel.EXCELLENT.value: 7,
}

ENERGY_SCORE_MAP: Dict[str, float] = {
    EnergyLevel.VERY_LOW.value: 0.2,
    EnergyLevel.LOW.value: 0.4,
    EnergyLevel.MODERATE.value: 0.7,
    EnergyLevel.HIGH.value: 0.9,
    EnergyLevel.VERY_HIGH.value: 1.0,
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
