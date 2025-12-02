from __future__ import annotations

from datetime import datetime
from typing import Iterable

from sqlalchemy.orm import Session

from app.models.checkin_sentiment import CheckinSentiment
from app.models.emotional_checkin import EmotionalCheckin
from app.models.journal import Journal
from app.models.journal_sentiment import JournalSentiment
from app.schemas.sentiment import SentimentResult
from app.utils.nlp_loader import SentimentOutput, analyze_text, analyze_checkin_text
from app.utils.text_cleaning import clean_text


class SentimentService:
    model_version: str = "heuristic-1.0"

    @classmethod
    def analyze_journal(cls, db: Session, journal_id: int) -> JournalSentiment:
        journal = db.get(Journal, journal_id)
        if not journal:
            raise ValueError("Journal not found")

        return cls._persist_journal_sentiment(db, journal)

    @classmethod
    def analyze_journals(cls, db: Session, journals: Iterable[Journal]) -> list[JournalSentiment]:
        return [cls._persist_journal_sentiment(db, journal) for journal in journals]

    @classmethod
    def analyze_checkin(cls, db: Session, checkin_id: int) -> CheckinSentiment:
        checkin = db.get(EmotionalCheckin, checkin_id)
        if not checkin:
            raise ValueError("Checkin not found")

        return cls._persist_checkin_sentiment(db, checkin)

    @classmethod
    def analyze_checkins(cls, db: Session, checkins: Iterable[EmotionalCheckin]) -> list[CheckinSentiment]:
        return [cls._persist_checkin_sentiment(db, checkin) for checkin in checkins]

    @classmethod
    def summarize_journal(cls, journal: Journal) -> SentimentResult:
        prediction = cls._predict(journal.content or "")
        return SentimentResult(**prediction.__dict__)

    @classmethod
    def summarize_checkin(cls, checkin: EmotionalCheckin) -> SentimentResult:
        prediction = cls._predict(checkin.comment or "")
        return SentimentResult(**prediction.__dict__)

    @classmethod
    def _persist_journal_sentiment(cls, db: Session, journal: Journal) -> JournalSentiment:
        prediction = cls._predict(journal.content or "")
        sentiment = JournalSentiment(
            journal_id=journal.journal_id,
            sentiment=prediction.sentiment,
            emotions=prediction.emotions,
            confidence=prediction.confidence,
            model_version=prediction.model_version,
            analyzed_at=datetime.utcnow(),
        )
        db.add(sentiment)
        db.flush()
        return sentiment

    @classmethod
    def _persist_checkin_sentiment(cls, db: Session, checkin: EmotionalCheckin) -> CheckinSentiment:
        """
        Analyze and persist sentiment for an emotional check-in.
        
        Uses context-aware analysis that integrates the user's reported
        mood, energy, stress, and feel_better state to prevent contradictions.
        """
        # Extract user context from the check-in
        mood_level = None
        energy_level = None
        stress_level = None
        feel_better = None
        
        # Get enum values as strings
        if checkin.mood_level:
            mood_level = checkin.mood_level.value if hasattr(checkin.mood_level, 'value') else str(checkin.mood_level)
        if checkin.energy_level:
            energy_level = checkin.energy_level.value if hasattr(checkin.energy_level, 'value') else str(checkin.energy_level)
        if checkin.stress_level:
            stress_level = checkin.stress_level.value if hasattr(checkin.stress_level, 'value') else str(checkin.stress_level)
        if checkin.feel_better:
            feel_better = checkin.feel_better.value if hasattr(checkin.feel_better, 'value') else str(checkin.feel_better)
        
        # Use context-aware analysis
        prediction = analyze_checkin_text(
            text=checkin.comment or "",
            mood_level=mood_level,
            energy_level=energy_level,
            stress_level=stress_level,
            feel_better=feel_better,
        )
        
        sentiment = CheckinSentiment(
            checkin_id=checkin.checkin_id,
            sentiment=prediction.sentiment,
            emotions=prediction.emotions,
            confidence=prediction.confidence,
            model_version=prediction.model_version,
            analyzed_at=datetime.utcnow(),
        )
        db.add(sentiment)
        db.flush()
        return sentiment

    @classmethod
    def _predict(cls, text: str) -> SentimentOutput:
        cleaned = clean_text(text)
        if not cleaned:
            return SentimentOutput(
                sentiment="neutral",
                emotions="neutral",
                confidence=0.5,
                model_version=cls.model_version,
            )
        prediction = analyze_text(cleaned)
        return SentimentOutput(
            sentiment=prediction.sentiment,
            emotions=prediction.emotions,
            confidence=prediction.confidence,
            model_version=prediction.model_version,
        )

    @classmethod
    def remove_existing_journal_sentiments(cls, db: Session, journal_id: int) -> int:
        return db.query(JournalSentiment).filter(JournalSentiment.journal_id == journal_id).delete()

    @classmethod
    def remove_existing_checkin_sentiments(cls, db: Session, checkin_id: int) -> int:
        return db.query(CheckinSentiment).filter(CheckinSentiment.checkin_id == checkin_id).delete()
