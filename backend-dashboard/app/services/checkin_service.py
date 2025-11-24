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
        # Mappings by string values as stored in DB
        mood_to7 = {
            "Very Sad": 1,
            "Sad": 2,
            "Neutral": 3,
            "Good": 4,
            "Happy": 5,
            "Very Happy": 6,
            "Excellent": 7,
        }
        mood_to100 = {
            "Very Sad": 0,
            "Sad": 17,
            "Neutral": 33,
            "Good": 50,
            "Happy": 67,
            "Very Happy": 83,
            "Excellent": 100,
        }
        energy_to5 = {
            "Very Low": 1,
            "Low": 2,
            "Moderate": 3,
            "High": 4,
            "Very High": 5,
        }
        energy_to100 = {
            "Very Low": 0,
            "Low": 25,
            "Moderate": 50,
            "High": 75,
            "Very High": 100,
        }
        stress_to5 = {
            "No Stress": 1,
            "Low Stress": 2,
            "Moderate": 3,
            "High Stress": 4,
            "Very High Stress": 5,
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
            d = row["created_at"].date()
            stats = daily.setdefault(d, {"count": 0.0, "mood7": 0.0, "energy5": 0.0, "stress5": 0.0, "index": 0.0})
            mood7 = mood_to7.get(row["mood_level"], 0)
            energy5 = energy_to5.get(row["energy_level"], 0)
            stress5 = stress_to5.get(row["stress_level"], 0)
            mood100 = mood_to100.get(row["mood_level"], 0)
            energy100 = energy_to100.get(row["energy_level"], 0)
            stress100 = stress_to100.get(row["stress_level"], 0)
            stats["count"] += 1
            stats["mood7"] += mood7
            stats["energy5"] += energy5
            stats["stress5"] += stress5
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
            min_date = min(daily.keys())
            max_data_date = max(daily.keys())
            today = date.today()
            max_date = max(max_data_date, today)
            start_date = monday_of(min_date)

        # Rolling weekly accumulators
        week_anchor = monday_of(start_date)
        rolling_count = 0.0
        rolling_mood7 = 0.0
        rolling_energy5 = 0.0
        rolling_stress5 = 0.0
        rolling_index = 0.0

        out: List[Dict[str, Any]] = []

        cur = start_date
        while cur <= max_date:
            cur_week = monday_of(cur)
            # Reset on new ISO week
            if cur_week != week_anchor:
                week_anchor = cur_week
                rolling_count = rolling_mood7 = rolling_energy5 = rolling_stress5 = rolling_index = 0.0

            # incorporate today's stats if any
            day_stats = daily.get(cur)
            if day_stats:
                rolling_count += day_stats["count"]
                rolling_mood7 += day_stats["mood7"]
                rolling_energy5 += day_stats["energy5"]
                rolling_stress5 += day_stats["stress5"]
                rolling_index += day_stats["index"]

            # only append at end-of-week (Sunday) or on the final date
            end_of_week = cur.weekday() == 6
            is_last_day = cur == max_date
            if end_of_week or is_last_day:
                if rolling_count > 0:
                    avg_mood = round(rolling_mood7 / rolling_count, 2)
                    avg_energy = round(rolling_energy5 / rolling_count, 2)
                    avg_stress = round(rolling_stress5 / rolling_count, 2)
                    avg_index = int(round(rolling_index / rolling_count))
                else:
                    avg_mood = 0.0
                    avg_energy = 0.0
                    avg_stress = 0.0
                    avg_index = 0

                out.append(
                    {
                        "week_start": cur_week.strftime("%Y-%m-%d"),
                        "week_end": cur.strftime("%Y-%m-%d"),
                        "index": avg_index,
                        "avg_mood": avg_mood,
                        "avg_energy": avg_energy,
                        "avg_stress": avg_stress,
                    }
                )

            cur = cur + timedelta(days=1)

        return out
