from __future__ import annotations

from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.schemas.notification import NotificationCreate, NotificationUpdate


class NotificationService:
    @staticmethod
    def list_notifications(db: Session, user_id: Optional[int] = None, *, skip: int = 0, limit: int = 100) -> List[Notification]:
        stmt = select(Notification).order_by(Notification.created_at.desc())
        if user_id is not None:
            stmt = stmt.where(Notification.user_id == user_id)
        stmt = stmt.offset(skip).limit(limit)
        return list(db.scalars(stmt))

    @staticmethod
    def get_notification(db: Session, notification_id: int) -> Optional[Notification]:
        stmt = select(Notification).where(Notification.notification_id == notification_id)
        return db.scalars(stmt).first()

    @staticmethod
    def create_notification(
        db: Session,
        notification_in: NotificationCreate,
        *,
        commit: bool = True,
    ) -> Notification:
        notification = Notification(**notification_in.model_dump(exclude_unset=True))
        db.add(notification)
        if commit:
            db.commit()
            db.refresh(notification)
        else:
            db.flush()
        return notification

    @staticmethod
    def update_notification(
        db: Session,
        notification: Notification,
        notification_in: NotificationUpdate,
        *,
        commit: bool = True,
    ) -> Notification:
        for field, value in notification_in.model_dump(exclude_unset=True).items():
            setattr(notification, field, value)
        db.add(notification)
        if commit:
            db.commit()
            db.refresh(notification)
        else:
            db.flush()
        return notification

    @staticmethod
    def delete_notification(db: Session, notification: Notification, *, commit: bool = True) -> None:
        db.delete(notification)
        if commit:
            db.commit()
        else:
            db.flush()
