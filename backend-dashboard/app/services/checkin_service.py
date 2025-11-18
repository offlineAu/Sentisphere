from __future__ import annotations

from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.checkin_sentiment import CheckinSentiment
from app.models.emotional_checkin import EmotionalCheckin
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
