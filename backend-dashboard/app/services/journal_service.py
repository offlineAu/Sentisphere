from __future__ import annotations

from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.journal import Journal
from app.models.journal_sentiment import JournalSentiment
from app.schemas.journal import JournalCreate, JournalUpdate


class JournalService:
    @staticmethod
    def list_journals(
        db: Session,
        *,
        user_id: Optional[int] = None,
        skip: int = 0,
        limit: int = 100,
    ) -> List[Journal]:
        stmt = (
            select(Journal)
            .options(joinedload(Journal.sentiments))
            .order_by(Journal.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        if user_id is not None:
            stmt = stmt.where(Journal.user_id == user_id)
        return list(db.scalars(stmt))

    @staticmethod
    def get_journal(db: Session, journal_id: int) -> Optional[Journal]:
        stmt = (
            select(Journal)
            .where(Journal.journal_id == journal_id)
            .options(joinedload(Journal.sentiments))
        )
        return db.scalars(stmt).first()

    @staticmethod
    def create_journal(db: Session, journal_in: JournalCreate, *, commit: bool = True) -> Journal:
        journal = Journal(**journal_in.model_dump(exclude_unset=True))
        db.add(journal)
        if commit:
            db.commit()
            db.refresh(journal)
        else:
            db.flush()
        return journal

    @staticmethod
    def update_journal(db: Session, journal: Journal, journal_in: JournalUpdate, *, commit: bool = True) -> Journal:
        for field, value in journal_in.model_dump(exclude_unset=True).items():
            setattr(journal, field, value)
        db.add(journal)
        if commit:
            db.commit()
            db.refresh(journal)
        else:
            db.flush()
        return journal

    @staticmethod
    def delete_journal(db: Session, journal: Journal, *, commit: bool = True) -> None:
        db.delete(journal)
        if commit:
            db.commit()
        else:
            db.flush()

    @staticmethod
    def remove_sentiments(db: Session, journal_id: int) -> int:
        stmt = select(JournalSentiment).where(JournalSentiment.journal_id == journal_id)
        sentiments = list(db.scalars(stmt))
        deleted = len(sentiments)
        for sentiment in sentiments:
            db.delete(sentiment)
        db.commit()
        return deleted
