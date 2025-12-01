from __future__ import annotations

from datetime import datetime, timedelta, date
from typing import List, Optional, Dict, Any

from sqlalchemy import select, text
from sqlalchemy.orm import Session, joinedload

from app.models.checkin_sentiment import CheckinSentiment
from app.models.emotional_checkin import EmotionalCheckin, MoodLevel, EnergyLevel, StressLevel
from app.schemas.checkin import EmotionalCheckinCreate, EmotionalCheckinUpdate


class CheckinService:
    @staticmethod
    def list_checkins(
        db: Session,
        *,
        user_id: Optional[int] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[EmotionalCheckin]:
        stmt = (
            select(EmotionalCheckin)
            .options(joinedload(EmotionalCheckin.sentiments))
            .order_by(EmotionalCheckin.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        if user_id is not None:
            stmt = stmt.where(EmotionalCheckin.user_id == user_id)
        return list(db.scalars(stmt))

    @staticmethod
    def get_checkin(db: Session, checkin_id: int) -> Optional[EmotionalCheckin]:
        stmt = (
            select(EmotionalCheckin)
            .where(EmotionalCheckin.checkin_id == checkin_id)
            .options(joinedload(EmotionalCheckin.sentiments))
        )
        return db.scalars(stmt).first()

    @staticmethod
    def create_checkin(
        db: Session,
        checkin_in: EmotionalCheckinCreate,
        *,
        commit: bool = True,
    ) -> EmotionalCheckin:
        checkin = EmotionalCheckin(**checkin_in.model_dump(exclude_unset=True))
        db.add(checkin)
        if commit:
            db.commit()
            db.refresh(checkin)
        else:
            db.flush()
        return checkin

    @staticmethod
    def update_checkin(
        db: Session,
        checkin: EmotionalCheckin,
        checkin_in: EmotionalCheckinUpdate,
        *,
        commit: bool = True,
    ) -> EmotionalCheckin:
        for field, value in checkin_in.model_dump(exclude_unset=True).items():
            setattr(checkin, field, value)
        db.add(checkin)
        if commit:
            db.commit()
            db.refresh(checkin)
        else:
            db.flush()
        return checkin

    @staticmethod
    def delete_checkin(db: Session, checkin: EmotionalCheckin, *, commit: bool = True) -> None:
        db.delete(checkin)
        if commit:
            db.commit()
        else:
            db.flush()

    @staticmethod
    def remove_sentiments(db: Session, checkin_id: int) -> int:
        stmt = select(CheckinSentiment).where(CheckinSentiment.checkin_id == checkin_id)
        sentiments = list(db.scalars(stmt))
        deleted = len(sentiments)
        for sentiment in sentiments:
            db.delete(sentiment)
        db.commit()
        return deleted

    @staticmethod
    def weekly_trend_rolling(
        db: Session,
        *,
        start: Optional[date] = None,
        end: Optional[date] = None,
    ) -> List[Dict[str, Any]]:
        """Return rolling weekly aggregates per calendar day (Mon–Sun weeks),
        including days with no check-ins.

        For each calendar date between the earliest check-in's week start (Monday)
        and the latest check-in date, compute aggregates from that week's Monday
        up to the current date. Reset on ISO week boundaries.
        """
        # Fetch raw rows ascending by created_at to avoid Enum conversion issues
        q = text(
            """
            SELECT mood_level, energy_level, stress_level, created_at
            FROM emotional_checkin
            ORDER BY created_at ASC
            """
        )
        rows = list(db.execute(q).mappings())
        # If there are absolutely no rows and no explicit range, nothing to emit.
        # If a range is provided, we'll still emit zero-valued weeks for that window.
        if not rows and (start is None or end is None):
            return []

        def monday_of(d: date) -> date:
            return d - timedelta(days=d.weekday())  # Monday = 0

        # Numeric mappings
        # Mappings by string values as stored in DB (1-9 scale)
        mood_to_score = {
            # New Enum Values
            "Terrible": 1,
            "Bad": 2,
            "Upset": 3,
            "Anxious": 4,
            "Meh": 5,
            "Okay": 6,
            "Great": 7,
            "Loved": 8,
            "Awesome": 9,
            # Old Enum Values (Backward Compatibility)
            "Very Sad": 1,
            "Sad": 2,
            "Neutral": 5,
            "Good": 6,
            "Happy": 7,
            "Very Happy": 8,
            "Excellent": 9,
        }
        mood_to100 = {
            # New Enum Values
            "Terrible": 11,
            "Bad": 22,
            "Upset": 33,
            "Anxious": 44,
            "Meh": 55,
            "Okay": 66,
            "Great": 77,
            "Loved": 88,
            "Awesome": 100,
            # Old Enum Values
            "Very Sad": 11,
            "Sad": 22,
            "Neutral": 55,
            "Good": 66,
            "Happy": 77,
            "Very Happy": 88,
            "Excellent": 100,
        }
        # Energy: Low, Moderate, High (1-3)
        energy_to_score = {
            "Low": 1,
            "Moderate": 2,
            "High": 3,
            # Old values
            "Very Low": 1,
            "Very High": 3,
        }
        # Stress: No Stress, Low, Moderate, High, Very High (1-5)
        # (Keys look compatible, checking "Low Stress" vs "Low" if needed)
        stress_to_score = {
            "No Stress": 1,
            "Low Stress": 2,
            "Moderate": 3,
            "High Stress": 4,
            "Very High Stress": 5,
        }
        energy_to100 = {
            "Low": 0,
            "Moderate": 50,
            "High": 100,
            # Old values
            "Very Low": 0,
            "Very High": 100,
        }
        stress_to100 = {
            "No Stress": 0,
            "Low Stress": 25,
            "Moderate": 50,
            "High Stress": 75,
            "Very High Stress": 100,
        }

        # Aggregate per calendar date first
        daily: Dict[date, Dict[str, float]] = {}
        for row in rows:
            # Skip rows with null created_at
            created_at = row["created_at"]
            if created_at is None:
                continue
            try:
                d = created_at.date() if hasattr(created_at, 'date') else created_at
            except Exception:
                continue
            stats = daily.setdefault(d, {"count": 0.0, "mood_score": 0.0, "energy_score": 0.0, "stress_score": 0.0, "index": 0.0})
            mood_score = mood_to_score.get(row["mood_level"], 0)
            energy_score = energy_to_score.get(row["energy_level"], 0)
            stress_score = stress_to_score.get(row["stress_level"], 0)
            mood100 = mood_to100.get(row["mood_level"], 0)
            energy100 = energy_to100.get(row["energy_level"], 0)
            stress100 = stress_to100.get(row["stress_level"], 0)
            stats["count"] += 1
            stats["mood_score"] += mood_score
            stats["energy_score"] += energy_score
            stats["stress_score"] += stress_score
            stats["index"] += 0.4 * mood100 + 0.3 * energy100 + 0.3 * (100 - stress100)

        # Determine continuous date range:
        # If explicit start/end provided, use them; otherwise start at earliest data week
        # and extend through today to include current week.
        if start is not None and end is not None:
            min_date = min(daily.keys()) if daily else start
            max_data_date = max(daily.keys()) if daily else end
            start_date = monday_of(start)
            max_date = end
        else:
            # If no valid data, return empty
            if not daily:
                return []
            min_date = min(daily.keys())
            max_data_date = max(daily.keys())
            today = date.today()
            max_date = max(max_data_date, today)
            start_date = monday_of(min_date)

        # Aggregate by week (Monday to Sunday)
        # Build a dict of week_start -> aggregated stats
        weekly: Dict[date, Dict[str, float]] = {}
        for day, stats in daily.items():
            week_start = monday_of(day)
            week_stats = weekly.setdefault(week_start, {"count": 0.0, "mood_score": 0.0, "energy_score": 0.0, "stress_score": 0.0, "index": 0.0})
            week_stats["count"] += stats["count"]
            week_stats["mood_score"] += stats["mood_score"]
            week_stats["energy_score"] += stats["energy_score"]
            week_stats["stress_score"] += stats["stress_score"]
            week_stats["index"] += stats["index"]

        # Determine all weeks to include (from earliest data to today's week)
        all_weeks: List[date] = []
        cur_week = monday_of(start_date)
        today_week = monday_of(date.today())
        end_week = monday_of(max_date)
        
        while cur_week <= max(end_week, today_week):
            all_weeks.append(cur_week)
            cur_week += timedelta(days=7)

        out: List[Dict[str, Any]] = []
        for week_start in all_weeks:
            week_end = week_start + timedelta(days=6)
            week_start_iso = week_start.isoformat()
            week_end_iso = week_end.isoformat()
            
            stats = weekly.get(week_start)
            if stats and stats["count"] > 0:
                cnt = stats["count"]
                out.append({
                    "date": week_start_iso,
                    "week_start": week_start_iso,
                    "week_end": week_end_iso,
                    "avg_mood": round(stats["mood_score"] / cnt, 2),
                    "avg_energy": round(stats["energy_score"] / cnt, 2),
                    "avg_stress": round(stats["stress_score"] / cnt, 2),
                    "index": round(stats["index"] / cnt, 1),
                    # camelCase for backward compatibility
                    "avgMood": round(stats["mood_score"] / cnt, 2),
                    "avgEnergy": round(stats["energy_score"] / cnt, 2),
                    "avgStress": round(stats["stress_score"] / cnt, 2),
                    "wellnessIndex": round(stats["index"] / cnt, 1),
                })
            else:
                # No data for this week
                out.append({
                    "date": week_start_iso,
                    "week_start": week_start_iso,
                    "week_end": week_end_iso,
                    "avg_mood": None,
                    "avg_energy": None,
                    "avg_stress": None,
                    "index": None,
                    "avgMood": None,
                    "avgEnergy": None,
                    "avgStress": None,
                    "wellnessIndex": None,
                })

        return out
