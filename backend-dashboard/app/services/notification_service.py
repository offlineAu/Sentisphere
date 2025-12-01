from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.notification import Notification, NotificationCategory, NotificationSource
from app.schemas.notification import NotificationCreate, NotificationUpdate


class NotificationService:
    """
    Service for managing notifications using the unified notification table.
    
    Categories: daily_quote, wellness_reminder, system, counselor_message, insight, other
    Sources: scheduler, alert_trigger, manual, system
    """
    
    @staticmethod
    def list_notifications(
        db: Session,
        user_id: Optional[int] = None,
        category: Optional[str] = None,
        is_read: Optional[bool] = None,
        *,
        skip: int = 0,
        limit: int = 100
    ) -> List[Notification]:
        """List notifications with optional filtering."""
        stmt = select(Notification).order_by(Notification.created_at.desc())
        
        if user_id is not None:
            stmt = stmt.where(Notification.user_id == user_id)
        if category is not None:
            stmt = stmt.where(Notification.category == category)
        if is_read is not None:
            stmt = stmt.where(Notification.is_read == is_read)
            
        stmt = stmt.offset(skip).limit(limit)
        return list(db.scalars(stmt))

    @staticmethod
    def get_notification(db: Session, notification_id: int) -> Optional[Notification]:
        """Get a notification by ID."""
        stmt = select(Notification).where(Notification.id == notification_id)
        return db.scalars(stmt).first()

    @staticmethod
    def create_notification(
        db: Session,
        notification_in: NotificationCreate,
        *,
        commit: bool = True,
    ) -> Notification:
        """Create a new notification."""
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
        """Update a notification."""
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
    def mark_as_read(
        db: Session,
        notification: Notification,
        *,
        commit: bool = True,
    ) -> Notification:
        """Mark a notification as read."""
        notification.is_read = True
        notification.read_at = datetime.utcnow()
        db.add(notification)
        if commit:
            db.commit()
            db.refresh(notification)
        else:
            db.flush()
        return notification

    @staticmethod
    def mark_as_sent(
        db: Session,
        notification: Notification,
        *,
        commit: bool = True,
    ) -> Notification:
        """Mark a notification as sent."""
        notification.is_sent = True
        notification.sent_at = datetime.utcnow()
        db.add(notification)
        if commit:
            db.commit()
            db.refresh(notification)
        else:
            db.flush()
        return notification

    @staticmethod
    def delete_notification(db: Session, notification: Notification, *, commit: bool = True) -> None:
        """Delete a notification."""
        db.delete(notification)
        if commit:
            db.commit()
        else:
            db.flush()
    
    @staticmethod
    def get_unread_count(db: Session, user_id: int) -> int:
        """Get count of unread notifications for a user."""
        stmt = select(Notification).where(
            Notification.user_id == user_id,
            Notification.is_read == False
        )
        return len(list(db.scalars(stmt)))
