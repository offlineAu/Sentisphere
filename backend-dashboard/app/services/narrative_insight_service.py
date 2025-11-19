from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta
from typing import Dict, Iterable, List

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.emotional_checkin import EmotionalCheckin
from app.models.journal import Journal
from app.utils.text_cleaning import clean_text, tokenize


class NarrativeInsightService:
    @staticmethod
    def _window_start(days: int) -> datetime:
        return datetime.utcnow() - timedelta(days=days)

    @staticmethod
    def _collect_texts(texts: Iterable[str | None]) -> List[str]:
        return [clean_text(t) for t in texts if t]

    @staticmethod
    def _top_keywords(texts: Iterable[str], limit: int = 5) -> List[str]:
        counter: Counter[str] = Counter()
        for text in texts:
            tokens = [token for token in tokenize(text) if len(token) > 3]
            counter.update(tokens)
        return [word for word, _ in counter.most_common(limit)]

    @classmethod
    def behavior_highlights(cls, db: Session, *, days: int = 30) -> Dict[str, List[str] | int]:
        window_start = cls._window_start(days)

        journal_stmt = select(Journal.content).where(Journal.created_at >= window_start)
        checkin_stmt = select(EmotionalCheckin.comment).where(
            EmotionalCheckin.created_at >= window_start
        )

        journal_texts = [row[0] for row in db.execute(journal_stmt)]
        checkin_texts = [row[0] for row in db.execute(checkin_stmt)]

        cleaned_texts = cls._collect_texts(journal_texts + checkin_texts)

        keywords = cls._top_keywords(cleaned_texts)

        journal_count = len(journal_texts)
        checkin_count = len(checkin_texts)

        return {
            "keywords": keywords,
            "journal_entries": journal_count,
            "checkins": checkin_count,
        }

    @classmethod
    def mood_shift_summary(cls, db: Session, *, days: int = 30) -> Dict[str, float | str]:
        window_start = cls._window_start(days)

        stmt = (
            select(
                func.date(EmotionalCheckin.created_at).label("date"),
                func.count().label("count"),
            )
            .where(EmotionalCheckin.created_at >= window_start)
            .group_by(func.date(EmotionalCheckin.created_at))
            .order_by(func.date(EmotionalCheckin.created_at))
        )

        rows = db.execute(stmt).all()
        if not rows:
            return {"trend": "stable", "details": []}

        counts = [row.count for row in rows]
        trend = "stable"
        if len(counts) >= 2:
            diff = counts[-1] - counts[0]
            if diff > 5:
                trend = "increasing"
            elif diff < -5:
                trend = "decreasing"

        details = [
            {"date": row.date.isoformat(), "count": int(row.count)}
            for row in rows
        ]
        return {"trend": trend, "details": details}

    @classmethod
    def generate_dashboard_copy(cls, db: Session) -> Dict[str, Dict[str, List[str] | str | int]]:
        highlights = cls.behavior_highlights(db)
        mood_shift = cls.mood_shift_summary(db)
        return {
            "behavior_highlights": highlights,
            "mood_shift": mood_shift,
        }
