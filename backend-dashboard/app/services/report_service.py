from __future__ import annotations

from datetime import datetime, timedelta
from typing import Dict, List

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models.alert import Alert, AlertSeverity
from app.models.emotional_checkin import EmotionalCheckin, EnergyLevel, MoodLevel, StressLevel
from app.models.journal import Journal
from app.models.notification import Notification


class ReportService:
    MOOD_SCORE_MAP: Dict[MoodLevel, int] = {
        MoodLevel.VERY_SAD: 1,
        MoodLevel.SAD: 2,
        MoodLevel.NEUTRAL: 3,
        MoodLevel.GOOD: 4,
        MoodLevel.HAPPY: 5,
        MoodLevel.VERY_HAPPY: 6,
        MoodLevel.EXCELLENT: 7,
    }

    STRESS_HIGH_LEVELS = {StressLevel.HIGH_STRESS, StressLevel.VERY_HIGH_STRESS}

    @staticmethod
    def weekly_insights(db: Session) -> Dict[str, float | int]:
        window_start = datetime.utcnow() - timedelta(days=7)

        journal_count = db.scalar(
            select(func.count(Journal.journal_id)).where(Journal.created_at >= window_start)
        ) or 0

        checkin_count = db.scalar(
            select(func.count(EmotionalCheckin.checkin_id)).where(EmotionalCheckin.created_at >= window_start)
        ) or 0

        avg_mood = db.scalar(
            select(
                func.avg(
                    case(
                        *[
                            (EmotionalCheckin.mood_level == mood, score)
                            for mood, score in ReportService.MOOD_SCORE_MAP.items()
                        ],
                        else_=3,
                    )
                )
            ).where(EmotionalCheckin.created_at >= window_start)
        )
        avg_mood_score = round(float(avg_mood), 2) if avg_mood else 0.0

        critical_alerts = db.scalar(
            select(func.count(Alert.alert_id)).where(
                Alert.created_at >= window_start,
                Alert.severity.in_([AlertSeverity.HIGH, AlertSeverity.CRITICAL]),
            )
        ) or 0

        notifications_sent = db.scalar(
            select(func.count(Notification.notification_id)).where(
                Notification.created_at >= window_start
            )
        ) or 0

        return {
            "journal_count": journal_count,
            "checkin_count": checkin_count,
            "avg_mood_score": avg_mood_score,
            "critical_alerts": critical_alerts,
            "notifications_sent": notifications_sent,
        }

    @staticmethod
    def mood_trends(db: Session, *, days: int = 30) -> List[Dict[str, float | str]]:
        window_start = datetime.utcnow() - timedelta(days=days)
        stmt = (
            select(
                func.date(EmotionalCheckin.created_at).label("date"),
                func.avg(
                    case(
                        *[
                            (EmotionalCheckin.mood_level == mood, score)
                            for mood, score in ReportService.MOOD_SCORE_MAP.items()
                        ],
                        else_=3,
                    )
                ).label("avg_mood"),
            )
            .where(EmotionalCheckin.created_at >= window_start)
            .group_by(func.date(EmotionalCheckin.created_at))
            .order_by(func.date(EmotionalCheckin.created_at))
        )
        rows = db.execute(stmt).all()
        return [
            {"date": row.date.isoformat(), "avg_mood": round(float(row.avg_mood or 0), 2)}
            for row in rows
        ]

    @staticmethod
    def wellness_trend(db: Session, *, days: int = 30) -> List[Dict[str, float | str]]:
        window_start = datetime.utcnow() - timedelta(days=days)
        stmt = (
            select(
                func.date(EmotionalCheckin.created_at).label("date"),
                func.avg(
                    case(
                        (EmotionalCheckin.energy_level.in_([EnergyLevel.HIGH, EnergyLevel.VERY_HIGH]), 1.0),
                        (EmotionalCheckin.energy_level == EnergyLevel.MODERATE, 0.7),
                        else_=0.4,
                    )
                ).label("energy_score"),
                func.avg(
                    case(
                        (EmotionalCheckin.stress_level.in_([StressLevel.NO_STRESS, StressLevel.LOW_STRESS]), 1.0),
                        (EmotionalCheckin.stress_level == StressLevel.MODERATE, 0.6),
                        else_=0.2,
                    )
                ).label("stress_score"),
            )
            .where(EmotionalCheckin.created_at >= window_start)
            .group_by(func.date(EmotionalCheckin.created_at))
            .order_by(func.date(EmotionalCheckin.created_at))
        )
        rows = db.execute(stmt).all()
        return [
            {
                "date": row.date.isoformat(),
                "energy_score": round(float(row.energy_score or 0), 2),
                "stress_score": round(float(row.stress_score or 0), 2),
            }
            for row in rows
        ]

    @staticmethod
    def journal_frequency(db: Session, *, days: int = 30) -> List[Dict[str, int | str]]:
        window_start = datetime.utcnow() - timedelta(days=days)
        stmt = (
            select(func.date(Journal.created_at).label("date"), func.count(Journal.journal_id).label("count"))
            .where(Journal.created_at >= window_start)
            .group_by(func.date(Journal.created_at))
            .order_by(func.date(Journal.created_at))
        )
        rows = db.execute(stmt).all()
        return [{"date": row.date.isoformat(), "count": int(row.count)} for row in rows]

    @staticmethod
    def alert_severity_summary(db: Session, *, days: int = 30) -> Dict[str, int]:
        window_start = datetime.utcnow() - timedelta(days=days)
        stmt = (
            select(Alert.severity, func.count(Alert.alert_id))
            .where(Alert.created_at >= window_start)
            .group_by(Alert.severity)
        )
        rows = db.execute(stmt).all()
        summary: Dict[str, int] = {severity.value: 0 for severity in AlertSeverity}
        for severity, count in rows:
            summary[severity.value if hasattr(severity, "value") else severity] = int(count)
        return summary

    @staticmethod
    def stress_spikes(db: Session, *, days: int = 30) -> List[Dict[str, int | str]]:
        window_start = datetime.utcnow() - timedelta(days=days)
        stmt = (
            select(
                func.date(EmotionalCheckin.created_at).label("date"),
                func.count(EmotionalCheckin.checkin_id).label("count"),
            )
            .where(
                EmotionalCheckin.created_at >= window_start,
                EmotionalCheckin.stress_level.in_(ReportService.STRESS_HIGH_LEVELS),
            )
            .group_by(func.date(EmotionalCheckin.created_at))
            .order_by(func.date(EmotionalCheckin.created_at))
        )
        rows = db.execute(stmt).all()
        return [{"date": row.date.isoformat(), "count": int(row.count)} for row in rows]

    @staticmethod
    def behavior_insights(db: Session) -> Dict[str, List[Dict[str, int | str]] | int]:
        return {
            "journal_frequency": ReportService.journal_frequency(db),
            "stress_spikes": ReportService.stress_spikes(db),
        }

    @staticmethod
    def trend_summary(db: Session) -> Dict[str, List[Dict[str, float | str]]]:
        return {
            "mood_trends": ReportService.mood_trends(db),
            "wellness_trend": ReportService.wellness_trend(db),
        }
