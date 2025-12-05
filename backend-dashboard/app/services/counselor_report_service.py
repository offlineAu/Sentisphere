from __future__ import annotations

from collections import Counter
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence

from sqlalchemy import and_, case, func, select
from sqlalchemy.orm import Session

from app.models.alert import Alert, AlertSeverity, AlertStatus
from app.models.appointment_log import AppointmentLog
from app.models.checkin_sentiment import CheckinSentiment
from app.models.emotional_checkin import EmotionalCheckin, EnergyLevel, MoodLevel, StressLevel
from app.models.journal import Journal
from app.models.journal_sentiment import JournalSentiment
from app.models.notification import Notification
from app.models.user import User, UserRole
from app.models.user_activity import UserActivity

ACADEMIC_EVENTS_FILE = Path(__file__).resolve().parents[1] / "data" / "school_calendar.json"
EVENTS_FALLBACK: List[Dict[str, str]] = [
    {"name": "Midterm Exams", "type": "exam", "start_date": "2025-11-10", "end_date": "2025-11-16"},
    {"name": "Final Exams", "type": "exam", "start_date": "2025-12-08", "end_date": "2025-12-14"},
    {"name": "Enrollment Week", "type": "enrollment", "start_date": "2025-06-10", "end_date": "2025-06-16"},
    {"name": "Project Week", "type": "project", "start_date": "2025-10-20", "end_date": "2025-10-26"},
]


class CounselorReportService:
    """Privacy-aware analytics for counselor dashboard endpoints."""

    @staticmethod
    def _week_bounds(anchor: date) -> tuple[datetime, datetime]:
        """Get ISO week bounds (Monday to Sunday)."""
        # ISO week: Monday = 0, Sunday = 6
        start = datetime.combine(anchor - timedelta(days=anchor.weekday()), datetime.min.time())
        end = start + timedelta(days=6, hours=23, minutes=59, seconds=59)
        return start, end

    @staticmethod
    def _window(start: datetime, weeks: int, offset: int = 0) -> tuple[datetime, datetime]:
        shifted_start = start - timedelta(weeks=offset)
        shifted_end = shifted_start + timedelta(days=6, hours=23, minutes=59, seconds=59)
        return shifted_start, shifted_end

    @staticmethod
    def _scale(val: Optional[float], min_val: float, max_val: float) -> float:
        if val is None:
            return 0.0
        return round(((float(val) - min_val) / (max_val - min_val)) * 100, 1)

    # ------------------------------------------------------------------
    # Academic events helpers
    # ------------------------------------------------------------------
    @classmethod
    def load_academic_events(cls) -> List[Dict[str, Any]]:
        if not ACADEMIC_EVENTS_FILE.exists():
            return EVENTS_FALLBACK.copy()
        try:
            import json

            with ACADEMIC_EVENTS_FILE.open("r", encoding="utf-8") as fh:
                data = json.load(fh)
            return data if isinstance(data, list) else EVENTS_FALLBACK.copy()
        except Exception:
            return EVENTS_FALLBACK.copy()

    @staticmethod
    def _event_overlaps(event: Dict[str, Any], start: date, end: date) -> bool:
        try:
            ev_start = datetime.strptime(event["start_date"], "%Y-%m-%d").date()
            ev_end = datetime.strptime(event["end_date"], "%Y-%m-%d").date()
        except Exception:
            return False
        return ev_start <= end and ev_end >= start

    # ------------------------------------------------------------------
    # Wellness metrics
    # ------------------------------------------------------------------
    @classmethod
    def _wellness_index(cls, db: Session, start_dt: datetime, end_dt: datetime) -> int:
        # SQLAlchemy 2.x expects each (condition, result) pair as a separate
        # positional argument to case(), not a single tuple of tuples.
        mood_case = case(
            (EmotionalCheckin.mood_level == MoodLevel.TERRIBLE, 0),
            (EmotionalCheckin.mood_level == MoodLevel.BAD, 12),
            (EmotionalCheckin.mood_level == MoodLevel.UPSET, 25),
            (EmotionalCheckin.mood_level == MoodLevel.ANXIOUS, 37),
            (EmotionalCheckin.mood_level == MoodLevel.MEH, 50),
            (EmotionalCheckin.mood_level == MoodLevel.OKAY, 62),
            (EmotionalCheckin.mood_level == MoodLevel.GREAT, 75),
            (EmotionalCheckin.mood_level == MoodLevel.LOVED, 87),
            (EmotionalCheckin.mood_level == MoodLevel.AWESOME, 100),
            else_=None,
        )
        energy_case = case(
            (EmotionalCheckin.energy_level == EnergyLevel.LOW, 0),
            (EmotionalCheckin.energy_level == EnergyLevel.MODERATE, 50),
            (EmotionalCheckin.energy_level == EnergyLevel.HIGH, 100),
            else_=None,
        )
        stress_case = case(
            (EmotionalCheckin.stress_level == StressLevel.NO_STRESS, 0),
            (EmotionalCheckin.stress_level == StressLevel.LOW_STRESS, 25),
            (EmotionalCheckin.stress_level == StressLevel.MODERATE, 50),
            (EmotionalCheckin.stress_level == StressLevel.HIGH_STRESS, 75),
            (EmotionalCheckin.stress_level == StressLevel.VERY_HIGH_STRESS, 100),
            else_=None,
        )

        stmt = select(
            func.round(
                func.avg(0.4 * mood_case + 0.3 * energy_case + 0.3 * (100 - stress_case)),
                0,
            )
        ).where(
            and_(
                EmotionalCheckin.created_at >= start_dt,
                EmotionalCheckin.created_at <= end_dt,
            )
        )
        value = db.scalar(stmt)
        try:
            return int(value or 0)
        except Exception:
            return 0

    @classmethod
    def _trend_metrics(cls, db: Session, start_dt: datetime, end_dt: datetime) -> Dict[str, float]:
        mood_score = select(
            func.avg(
                case(
                    (EmotionalCheckin.mood_level == MoodLevel.TERRIBLE, 1),
                    (EmotionalCheckin.mood_level == MoodLevel.BAD, 2),
                    (EmotionalCheckin.mood_level == MoodLevel.UPSET, 3),
                    (EmotionalCheckin.mood_level == MoodLevel.ANXIOUS, 4),
                    (EmotionalCheckin.mood_level == MoodLevel.MEH, 5),
                    (EmotionalCheckin.mood_level == MoodLevel.OKAY, 6),
                    (EmotionalCheckin.mood_level == MoodLevel.GREAT, 7),
                    (EmotionalCheckin.mood_level == MoodLevel.LOVED, 8),
                    (EmotionalCheckin.mood_level == MoodLevel.AWESOME, 9),
                    else_=None,
                )
            )
        ).where(
            and_(
                EmotionalCheckin.created_at >= start_dt,
                EmotionalCheckin.created_at <= end_dt,
            )
        )

        energy_score = select(
            func.avg(
                case(
                    (EmotionalCheckin.energy_level == EnergyLevel.LOW, 1),
                    (EmotionalCheckin.energy_level == EnergyLevel.MODERATE, 2),
                    (EmotionalCheckin.energy_level == EnergyLevel.HIGH, 3),
                    else_=None,
                )
            )
        ).where(
            and_(
                EmotionalCheckin.created_at >= start_dt,
                EmotionalCheckin.created_at <= end_dt,
            )
        )

        stress_score = select(
            func.avg(
                case(
                    (
                        (EmotionalCheckin.stress_level == StressLevel.NO_STRESS, 1),
                        (EmotionalCheckin.stress_level == StressLevel.LOW_STRESS, 2),
                        (EmotionalCheckin.stress_level == StressLevel.MODERATE, 3),
                        (EmotionalCheckin.stress_level == StressLevel.HIGH_STRESS, 4),
                        (EmotionalCheckin.stress_level == StressLevel.VERY_HIGH_STRESS, 5),
                    ),
                    else_=None,
                )
            )
        ).where(
            and_(
                EmotionalCheckin.created_at >= start_dt,
                EmotionalCheckin.created_at <= end_dt,
            )
        )

        mood_raw = db.scalar(mood_score)
        energy_raw = db.scalar(energy_score)
        stress_raw = db.scalar(stress_score)
        return {
            "avg_mood": cls._scale(mood_raw, 1, 9),
            "avg_energy": cls._scale(energy_raw, 1, 3),
            "avg_stress": cls._scale(stress_raw, 1, 5),
        }

    # ------------------------------------------------------------------
    # Sentiment aggregates (no raw text exposure)
    # ------------------------------------------------------------------
    @staticmethod
    def _top_sentiment_labels(values: Iterable[str], limit: int = 3) -> List[str]:
        counter = Counter()
        for val in values:
            if not val:
                continue
            counter[val.lower()] += 1
        return [name for name, _ in counter.most_common(limit)]

    @classmethod
    def _sentiment_labels(
        cls, db: Session, start_dt: datetime, end_dt: datetime
    ) -> List[str]:
        journal_stmt = select(JournalSentiment.sentiment).join(Journal).where(
            and_(Journal.created_at >= start_dt, Journal.created_at <= end_dt)
        )
        checkin_stmt = select(CheckinSentiment.sentiment).join(EmotionalCheckin).where(
            and_(
                EmotionalCheckin.created_at >= start_dt,
                EmotionalCheckin.created_at <= end_dt,
            )
        )
        journal_vals = [row[0] for row in db.execute(journal_stmt)]
        checkin_vals = [row[0] for row in db.execute(checkin_stmt)]
        return cls._top_sentiment_labels(journal_vals + checkin_vals, limit=3)

    # ------------------------------------------------------------------
    # Public service methods
    # ------------------------------------------------------------------
    @classmethod
    def summary(
        cls,
        db: Session,
        *,
        academic_events: Optional[Sequence[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        events = list(academic_events or cls.load_academic_events())
        today = datetime.utcnow().date()
        base_start, _ = cls._week_bounds(today)

        insight_weeks = 4
        previous_index: Optional[int] = None
        insights: List[Dict[str, Any]] = []

        for offset in range(insight_weeks - 1, -1, -1):
            start_dt, end_dt = cls._window(base_start, insight_weeks, offset)
            idx = cls._wellness_index(db, start_dt, end_dt)
            change = 0 if previous_index is None else idx - previous_index
            previous_index = idx

            ev_name = None
            ev_type = None
            for event in events:
                if cls._event_overlaps(event, start_dt.date(), end_dt.date()):
                    ev_name = event.get("name")
                    ev_type = event.get("type")
                    break

            themes = cls._sentiment_labels(db, start_dt, end_dt)
            if change >= 5:
                title = "Wellness Surge"
                direction = f"rose by {change} points"
            elif change <= -5:
                title = "Wellness Dip"
                direction = f"fell by {abs(change)} points"
            elif change > 0:
                title = "Positive Momentum"
                direction = f"rose by {change} point{'' if change == 1 else 's'}"
            elif change < 0:
                title = "Downward Shift"
                direction = f"fell by {abs(change)} point{'' if change == -1 else 's'}"
            else:
                title = "Stable Wellness"
                direction = "held steady"

            description = f"Wellness index {direction} to {idx}."
            if ev_name:
                description += f" During {ev_name.lower()}, monitor for stress triggers."

            recommendation = cls._build_recommendation(change, themes)

            insights.append(
                {
                    "week_start": start_dt.strftime("%Y-%m-%d"),
                    "week_end": end_dt.strftime("%Y-%m-%d"),
                    "event_name": ev_name,
                    "event_type": ev_type,
                    "title": title,
                    "description": description,
                    "recommendation": recommendation,
                    "index": idx,
                    "change": change,
                }
            )

        insights.reverse()
        current = insights[0]
        previous = insights[1] if len(insights) > 1 else insights[0]

        return {
            "week_start": current["week_start"],
            "week_end": current["week_end"],
            "current_wellness_index": current["index"],
            "previous_wellness_index": previous["index"],
            "change": current["index"] - previous["index"],
            "event_name": current["event_name"],
            "event_type": current["event_type"],
            "insight": current["description"],
            "insights": [
                {
                    "week_start": item["week_start"],
                    "week_end": item["week_end"],
                    "event_name": item["event_name"],
                    "event_type": item["event_type"],
                    "title": item["title"],
                    "description": item["description"],
                    "recommendation": item["recommendation"],
                }
                for item in insights
            ],
        }

    @classmethod
    def trends(cls, db: Session, *, weeks: int = 12) -> Dict[str, Any]:
        today = datetime.utcnow().date()
        base_start, _ = cls._week_bounds(today)
        records: List[Dict[str, Any]] = []

        for offset in range(weeks - 1, -1, -1):
            start_dt, end_dt = cls._window(base_start, weeks, offset)
            index_val = cls._wellness_index(db, start_dt, end_dt)
            metrics = cls._trend_metrics(db, start_dt, end_dt)
            records.append(
                {
                    "week_start": start_dt.date(),
                    "week_end": end_dt.date(),
                    "index": index_val,
                    "avg_mood": metrics["avg_mood"],
                    "avg_energy": metrics["avg_energy"],
                    "avg_stress": metrics["avg_stress"],
                }
            )

        dates = [item["week_start"].strftime("%Y-%m-%d") for item in records]
        wellness = [item["index"] for item in records]
        mood = [item["avg_mood"] for item in records]
        energy = [item["avg_energy"] for item in records]
        stress = [item["avg_stress"] for item in records]

        current_index = wellness[-1] if wellness else 0
        previous_index = wellness[-2] if len(wellness) > 1 else current_index
        change_percent = 0
        if previous_index:
            change_percent = round(((current_index - previous_index) / max(previous_index, 1e-9)) * 100)

        return {
            "dates": dates,
            "mood": mood,
            "energy": energy,
            "stress": stress,
            "wellness_index": wellness,
            "current_index": current_index,
            "previous_index": previous_index,
            "change_percent": change_percent,
            "numerical_change": current_index - previous_index,
            "weeks": records,
        }

    @classmethod
    def engagement_metrics(cls, db: Session) -> Dict[str, Any]:
        today = datetime.utcnow().date()
        this_start, this_end = cls._week_bounds(today)
        last_start = this_start - timedelta(days=7)
        last_end = this_end - timedelta(days=7)

        def _counts(start_dt: datetime, end_dt: datetime) -> tuple[int, int]:
            stmt = select(
                func.count(func.distinct(EmotionalCheckin.user_id)),
                func.count(EmotionalCheckin.checkin_id),
            ).where(
                and_(
                    EmotionalCheckin.created_at >= start_dt,
                    EmotionalCheckin.created_at <= end_dt,
                )
            )
            active, total = db.execute(stmt).one_or_none() or (0, 0)
            return int(active or 0), int(total or 0)

        active_this, total_this = _counts(this_start, this_end)
        active_last, total_last = _counts(last_start, last_end)
        total_students = db.scalar(select(func.count(User.user_id)).where(User.role == UserRole.STUDENT)) or 0

        avg_this = round(total_this / active_this, 1) if active_this else 0.0
        part_this = (active_this / total_students) if total_students else 0.0
        part_last = (active_last / total_students) if total_students else 0.0
        if part_last:
            change_pct = round(((part_this - part_last) * 100) / max(part_last, 1e-9))
            participation_change = f"{change_pct:+d}%"
        else:
            participation_change = "0%"

        return {
            "active_students_this_week": active_this,
            "active_students_last_week": active_last,
            "avg_checkins_per_student": avg_this,
            "participation_change": participation_change,
        }

    @classmethod
    def weekly_insights(
        cls,
        db: Session,
        *,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
        academic_events: Optional[Sequence[Dict[str, Any]]] = None,
        weeks: int = 6,
        min_checkins: int = 3,  # Minimum check-ins required for insight
    ) -> List[Dict[str, Any]]:
        """Generate weekly insights using ISO weeks, with minimum data requirement.
        
        Auto-deletes insights older than 3 weeks.
        """
        # Auto-delete old insights (3+ weeks old)
        three_weeks_ago = datetime.utcnow() - timedelta(weeks=3)
        try:
            from app.models.ai_insight import AIInsight
            db.query(AIInsight).filter(
                AIInsight.type == 'weekly',
                AIInsight.generated_at < three_weeks_ago
            ).delete(synchronize_session=False)
            db.commit()
        except Exception:
            db.rollback()
        
        events = list(academic_events or cls.load_academic_events())
        today = datetime.utcnow().date()
        
        # If start/end provided, use them to determine base_start as datetime
        if start and end:
            anchor_date = start.date() if isinstance(start, datetime) else start
            # Adjust to ISO week boundary (Monday)
            adjusted_date = anchor_date - timedelta(days=anchor_date.weekday())
            base_start = datetime.combine(adjusted_date, datetime.min.time())
        else:
            base_start, _ = cls._week_bounds(today)
        
        records: List[Dict[str, Any]] = []

        for offset in range(weeks - 1, -1, -1):
            start_dt, end_dt = cls._window(base_start, weeks, offset)
            
            # Check if there's enough data for this week
            checkin_count = db.scalar(
                select(func.count(EmotionalCheckin.checkin_id)).where(
                    and_(
                        EmotionalCheckin.created_at >= start_dt,
                        EmotionalCheckin.created_at <= end_dt
                    )
                )
            ) or 0
            
            # Skip weeks with insufficient data
            if checkin_count < min_checkins:
                continue
            
            index_val = cls._wellness_index(db, start_dt, end_dt)
            prev_start, prev_end = cls._window(base_start, weeks, offset + 1) if offset + 1 < weeks else (start_dt, end_dt)
            prev_index = cls._wellness_index(db, prev_start, prev_end)
            change = index_val - prev_index

            title = "Stable Wellness"
            if change > 5:
                title = "Wellness Surge"
            elif change < -5:
                title = "Wellness Dip"

            recommendation = cls._build_recommendation(change, cls._sentiment_labels(db, start_dt, end_dt))
            # Convert datetime to date for event matching
            start_date = start_dt.date() if isinstance(start_dt, datetime) else start_dt
            end_date = end_dt.date() if isinstance(end_dt, datetime) else end_dt
            matched_event = next((ev for ev in events if cls._event_overlaps(ev, start_date, end_date)), None)

            records.append(
                {
                    "week_start": start_dt.strftime("%Y-%m-%d"),
                    "week_end": end_dt.strftime("%Y-%m-%d"),
                    "event_name": matched_event.get("name") if matched_event else None,
                    "event_type": matched_event.get("type") if matched_event else None,
                    "title": title,
                    "description": f"Wellness index {('rose' if change >= 0 else 'fell')} by {abs(change)} points to {index_val}.",
                    "recommendation": recommendation,
                    "checkin_count": checkin_count,  # Include for transparency
                }
            )

        return records

    @classmethod
    def behavior_insights(
        cls,
        db: Session,
        *,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
    ) -> List[Dict[str, Any]]:
        """Generate behavioral insights, optionally filtered by date range."""
        today = datetime.utcnow().date()
        
        # If start/end provided, use them as this week's window
        if start and end:
            this_start = start
            this_end = end
            # Calculate last week relative to provided range
            range_days = (end - start).days if hasattr(end - start, 'days') else 7
            last_start = start - timedelta(days=range_days + 1)
            last_end = start - timedelta(days=1)
        else:
            this_start, this_end = cls._week_bounds(today)
            last_start = this_start - timedelta(days=7)
            last_end = this_end - timedelta(days=7)

        stress_stmt = select(func.count(EmotionalCheckin.checkin_id)).where(
            and_(
                EmotionalCheckin.created_at >= this_start,
                EmotionalCheckin.created_at <= this_end,
                EmotionalCheckin.stress_level.in_([StressLevel.HIGH_STRESS, StressLevel.VERY_HIGH_STRESS]),
            )
        )
        stress_last_stmt = select(func.count(EmotionalCheckin.checkin_id)).where(
            and_(
                EmotionalCheckin.created_at >= last_start,
                EmotionalCheckin.created_at <= last_end,
                EmotionalCheckin.stress_level.in_([StressLevel.HIGH_STRESS, StressLevel.VERY_HIGH_STRESS]),
            )
        )

        this_stress = db.scalar(stress_stmt) or 0
        last_stress = db.scalar(stress_last_stmt) or 0
        stress_delta = this_stress - last_stress
        stress_pct = f"{round(((this_stress - last_stress) / max(last_stress, 1e-9)) * 100) if last_stress else 0:+}%"

        journal_stmt = select(func.count(Journal.journal_id)).where(
            and_(Journal.created_at >= this_start, Journal.created_at <= this_end)
        )
        journal_last_stmt = select(func.count(Journal.journal_id)).where(
            and_(Journal.created_at >= last_start, Journal.created_at <= last_end)
        )

        journals_this = db.scalar(journal_stmt) or 0
        journals_last = db.scalar(journal_last_stmt) or 0

        return [
            {
                "title": "Stress Spike Patterns",
                "description": "Weekly comparison of high-stress check-ins reveals acute pressure points.",
                "metrics": [
                    {"label": "High stress cases (current)", "value": this_stress},
                    {"label": "High stress cases (last)", "value": last_stress},
                    {"label": "Change", "value": f"{stress_delta:+}"},
                    {"label": "% Change", "value": stress_pct},
                ],
            },
            {
                "title": "Journaling Correlation",
                "description": "Journal activity often mirrors processing and engagement levels.",
                "metrics": [
                    {"label": "Journals (current week)", "value": journals_this},
                    {"label": "Journals (last week)", "value": journals_last},
                    {"label": "Change", "value": f"{journals_this - journals_last:+}"},
                ],
            },
        ]

    @classmethod
    def top_stats(cls, db: Session) -> Dict[str, Any]:
        # Define comparison windows: this week vs last week
        today = datetime.utcnow().date()
        this_start, this_end = cls._week_bounds(today)
        last_start = this_start - timedelta(days=7)
        last_end = this_end - timedelta(days=7)

        # Total students is effectively a point-in-time count; we expose a
        # previous value for symmetry (it will usually match current).
        total_students_stmt = select(func.count(User.user_id)).where(User.role == UserRole.STUDENT)
        total_students = int(db.scalar(total_students_stmt) or 0)

        # Active users: distinct students with at least one emotional check-in
        # in the given window.
        def _active_users(start_dt: datetime, end_dt: datetime) -> int:
            stmt = (
                select(func.count(func.distinct(EmotionalCheckin.user_id)))
                .where(
                    and_(
                        EmotionalCheckin.created_at >= start_dt,
                        EmotionalCheckin.created_at <= end_dt,
                    )
                )
            )
            return int(db.scalar(stmt) or 0)

        active_this = _active_users(this_start, this_end)
        active_last = _active_users(last_start, last_end)

        # At-risk students: open high alerts in each window.
        def _at_risk(start_dt: datetime, end_dt: datetime) -> int:
            stmt = select(func.count(Alert.alert_id)).where(
                Alert.severity == AlertSeverity.HIGH,
                Alert.status == AlertStatus.OPEN,
                Alert.created_at >= start_dt,
                Alert.created_at <= end_dt,
            )
            return int(db.scalar(stmt) or 0)

        at_risk_this = _at_risk(this_start, this_end)
        at_risk_last = _at_risk(last_start, last_end)

        # Average wellness score: reuse the wellness index helper on the same
        # windows so that card deltas align with weekly dynamics.
        avg_wellness_this = float(cls._wellness_index(db, this_start, this_end) or 0.0)
        avg_wellness_last = float(cls._wellness_index(db, last_start, last_end) or 0.0)

        return {
            "total_students": total_students,
            "total_students_previous": total_students,
            "active_users": active_this,
            "active_users_previous": active_last,
            "at_risk_students": at_risk_this,
            "at_risk_students_previous": at_risk_last,
            "avg_wellness_score": avg_wellness_this,
            "avg_wellness_score_previous": avg_wellness_last,
        }

    @classmethod
    def attention_students(cls, db: Session, limit: int = 10) -> List[Dict[str, Any]]:
        alerts_subquery = (
            select(
                Alert.user_id.label("student_id"),
                Alert.severity,
                Alert.assigned_to,
                func.max(Alert.created_at).label("last_contact"),
                func.group_concat(Alert.reason.distinct()).label("concerns"),
            )
            .where(Alert.status == AlertStatus.OPEN)
            .group_by(Alert.user_id, Alert.severity, Alert.assigned_to)
            .subquery()
        )

        stmt = (
            select(
                User.user_id,
                User.name,
                alerts_subquery.c.severity,
                alerts_subquery.c.assigned_to,
                alerts_subquery.c.last_contact,
                alerts_subquery.c.concerns,
                func.round(
                    func.avg(
                        case(
                            (EmotionalCheckin.mood_level == MoodLevel.TERRIBLE, 1),
                            (EmotionalCheckin.mood_level == MoodLevel.BAD, 2),
                            (EmotionalCheckin.mood_level == MoodLevel.UPSET, 3),
                            (EmotionalCheckin.mood_level == MoodLevel.ANXIOUS, 4),
                            (EmotionalCheckin.mood_level == MoodLevel.MEH, 5),
                            (EmotionalCheckin.mood_level == MoodLevel.OKAY, 6),
                            (EmotionalCheckin.mood_level == MoodLevel.GREAT, 7),
                            (EmotionalCheckin.mood_level == MoodLevel.LOVED, 8),
                            (EmotionalCheckin.mood_level == MoodLevel.AWESOME, 9),
                            else_=None,
                        )
                    ),
                    1,
                ).label("score"),
            )
            .join(alerts_subquery, alerts_subquery.c.student_id == User.user_id, isouter=True)
            .join(EmotionalCheckin, EmotionalCheckin.user_id == User.user_id, isouter=True)
            .where(User.role == UserRole.STUDENT)
            .group_by(
                User.user_id,
                User.name,
                alerts_subquery.c.severity,
                alerts_subquery.c.assigned_to,
                alerts_subquery.c.last_contact,
                alerts_subquery.c.concerns,
            )
            .having(alerts_subquery.c.severity.isnot(None))
            .order_by("score")
            .limit(limit)
        )

        counselor_lookup = {
            user.user_id: user.name
            for user in db.execute(select(User.user_id, User.name).where(User.role == UserRole.COUNSELOR))
        }

        items: List[Dict[str, Any]] = []
        for row in db.execute(stmt):
            concerns = row.concerns.split(",") if row.concerns else []
            items.append(
                {
                    "user_id": row.user_id,
                    "name": row.name,
                    "risk": (row.severity or "low").capitalize(),
                    "score": f"{row.score or 0}/10",
                    "counselor": counselor_lookup.get(row.assigned_to, "Unassigned"),
                    "last_contact": row.last_contact.isoformat() if row.last_contact else "",
                    "concerns": [c.strip() for c in concerns if c],
                }
            )
        return items

    @classmethod
    def concerns(cls, db: Session, *, start: datetime, end: datetime) -> List[Dict[str, Any]]:
        def _all_emotions(stmt):
            rows = db.execute(stmt).all()
            counter = Counter()
            for row in rows:
                tokens = [token.strip().lower() for token in (row[0] or "").split(",") if token.strip()]
                counter.update(tokens)
            total = sum(counter.values()) or 1
            return [
                {
                    "label": label,
                    "students": count,
                    "percent": round((count / total) * 100, 1),
                }
                for label, count in counter.most_common(5)
            ]

        journal_stmt = (
            select(JournalSentiment.emotions)
            .where(
                JournalSentiment.analyzed_at >= start,
                JournalSentiment.analyzed_at <= end,
            )
        )
        checkin_stmt = (
            select(CheckinSentiment.emotions)
            .where(
                CheckinSentiment.analyzed_at >= start,
                CheckinSentiment.analyzed_at <= end,
            )
        )

        combined = _all_emotions(journal_stmt) + _all_emotions(checkin_stmt)
        if combined:
            # merge duplicates by label
            merged: Dict[str, Dict[str, Any]] = {}
            for entry in combined:
                label = entry["label"]
                if label in merged:
                    merged[label]["students"] += entry["students"]
                    merged[label]["percent"] += entry["percent"]
                else:
                    merged[label] = entry.copy()
            total_students = sum(item["students"] for item in merged.values()) or 1
            return [
                {
                    "label": label,
                    "students": values["students"],
                    "percent": round((values["students"] / total_students) * 100, 1),
                }
                for label, values in sorted(merged.items(), key=lambda kv: kv[1]["students"], reverse=True)[:5]
            ]

        # Fallback: sentiment distribution
        sentiment_stmt = (
            select(JournalSentiment.sentiment)
            .where(
                JournalSentiment.analyzed_at >= start,
                JournalSentiment.analyzed_at <= end,
            )
        )
        sentiments = [row[0] for row in db.execute(sentiment_stmt)]
        if sentiments:
            counter = Counter(val.lower() for val in sentiments if val)
            total = sum(counter.values()) or 1
            return [
                {
                    "label": label,
                    "students": count,
                    "percent": round((count / total) * 100, 1),
                }
                for label, count in counter.most_common(5)
            ]

        # Final fallback: top alert reasons in the same window
        alerts_stmt = (
            select(Alert.reason)
            .where(
                Alert.created_at >= start,
                Alert.created_at <= end,
                Alert.reason.isnot(None),
            )
        )
        counter = Counter(row[0].strip().lower() for row in db.execute(alerts_stmt) if row[0])
        total = sum(counter.values()) or 1
        return [
            {
                "label": label,
                "students": count,
                "percent": round((count / total) * 100, 1),
            }
            for label, count in counter.most_common(5)
        ]

    @classmethod
    def interventions(cls, db: Session, *, start: datetime, end: datetime) -> Dict[str, Any]:
        alert_stmt = select(
            func.count(Alert.alert_id),
            func.sum(case((Alert.status == AlertStatus.RESOLVED, 1), else_=0)),
        ).where(
            Alert.created_at >= start,
            Alert.created_at <= end,
        )
        total_alerts, resolved = db.execute(alert_stmt).one_or_none() or (0, 0)
        total_alerts = int(total_alerts or 0)
        resolved = int(resolved or 0)
        success_rate = round((resolved / total_alerts) * 100, 1) if total_alerts else 0.0

        # Attempt to use appointment logs as proxy for intervention types
        fallback_stmt = (
            select(
                AppointmentLog.form_type,
                func.count(AppointmentLog.log_id).label("participants"),
            )
            .where(
                AppointmentLog.downloaded_at >= start,
                AppointmentLog.downloaded_at <= end,
            )
            .group_by(AppointmentLog.form_type)
            .order_by(func.count(AppointmentLog.log_id).desc())
        )
        rows = db.execute(fallback_stmt)
        total = sum(int(r.participants or 0) for r in rows)
        by_type = [
            {
                "label": r.form_type,
                "participants": int(r.participants or 0),
                "percent": round((int(r.participants or 0) / total) * 100, 1) if total else 0,
            }
            for r in rows
        ]

        return {
            "summary": {
                "total_alerts": total_alerts,
                "resolved_alerts": resolved,
                "success_rate": success_rate,
            },
            "by_type": by_type,
            "sentiment_change": [],
        }

    @classmethod
    def participation(cls, db: Session) -> Dict[str, Any]:
        total = db.scalar(select(func.count(User.user_id)).where(User.role == UserRole.STUDENT)) or 0
        submitted = db.scalar(
            select(func.count(func.distinct(EmotionalCheckin.user_id))).where(
                EmotionalCheckin.created_at >= datetime.utcnow().date()
            )
        ) or 0
        participation = round((submitted / total) * 100, 1) if total else 0
        return {
            "total": total,
            "submitted": submitted,
            "participation": participation,
        }

    @classmethod
    def recent_alerts(cls, db: Session, *, limit: int = 5) -> List[Dict[str, Any]]:
        stmt = (
            select(
                Alert.alert_id,
                func.lower(Alert.severity).label("severity"),
                func.lower(Alert.status).label("status"),
                Alert.created_at,
                User.name.label("student_name"),
            )
            .join(User, Alert.user_id == User.user_id)
            .where(Alert.status.in_([AlertStatus.OPEN, AlertStatus.IN_PROGRESS, AlertStatus.RESOLVED]))
            .order_by(Alert.created_at.desc())
            .limit(limit)
        )
        return [
            {
                "id": row.alert_id,
                "name": row.student_name,
                # Use plain string values to avoid enum mapping issues with legacy data
                "severity": row.severity,
                "status": row.status,
                "created_at": row.created_at,
            }
            for row in db.execute(stmt)
        ]

    @classmethod
    def list_alerts(cls, db: Session, *, limit: int = 100) -> List[Dict[str, Any]]:
        stmt = (
            select(func.lower(Alert.severity).label("severity"), Alert.created_at)
            .where(Alert.severity.in_([AlertSeverity.LOW, AlertSeverity.MEDIUM, AlertSeverity.HIGH]))
            .order_by(Alert.created_at.desc())
            .limit(limit)
        )
        return [
            {
                # Severity is already a simple string from the query
                "severity": row.severity,
                "created_at": row.created_at,
            }
            for row in db.execute(stmt)
        ]

    @classmethod
    def alert_severity_counts(cls, db: Session) -> Dict[str, int]:
        stmt = select(Alert.severity, func.count(Alert.alert_id)).group_by(Alert.severity)
        counts = {severity.value if isinstance(severity, AlertSeverity) else severity: int(count) for severity, count in db.execute(stmt)}
        for severity in AlertSeverity:
            counts.setdefault(severity.value, 0)
        return counts

    @classmethod
    def intervention_success(cls, db: Session) -> Dict[str, Any]:
        stmt_conversations = select(func.count(func.distinct(UserActivity.target_id))).where(
            UserActivity.target_type == "conversation",
            UserActivity.action == "end",
        )
        total_sessions = db.scalar(stmt_conversations) or 0

        # Placeholder heuristics without exposing message text
        resolved_alerts = db.scalar(select(func.count(Alert.alert_id)).where(Alert.status == AlertStatus.RESOLVED)) or 0
        success_rate = round((resolved_alerts / total_sessions) * 100, 2) if total_sessions else 0.0

        return {
            "overall_success_rate": success_rate,
            "total_sessions": total_sessions,
            "successful_sessions": resolved_alerts,
            "average_conversation_duration_minutes": 0.0,
            "average_messages_per_conversation": 0.0,
        }

    @staticmethod
    def _build_recommendation(change: int, themes: List[str]) -> str:
        if change >= 5:
            base = "Momentum is positive. Continue reinforcing healthy routines."
        elif change <= -5:
            base = "Consider proactive outreach—students may need extra support this week."
        else:
            base = "Wellness is stable. Maintain regular check-ins."
        if themes:
            note = ", ".join(themes[:2])
            return f"{base} Watch for recurring sentiments: {note}."
        return base
