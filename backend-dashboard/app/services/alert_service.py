from __future__ import annotations

import logging
from typing import List, Optional, Dict, Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.alert import Alert
from app.schemas.alert import AlertCreate, AlertUpdate

logger = logging.getLogger(__name__)


class AlertService:
    @staticmethod
    def list_alerts(db: Session, *, skip: int = 0, limit: int = 100) -> List[Alert]:
        stmt = (
            select(Alert)
            .order_by(Alert.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        return list(db.scalars(stmt))

    @staticmethod
    def get_alert(db: Session, alert_id: int) -> Optional[Alert]:
        stmt = select(Alert).where(Alert.alert_id == alert_id)
        return db.scalars(stmt).first()

    @staticmethod
    def create_alert(db: Session, alert_in: AlertCreate, *, commit: bool = True) -> Alert:
        alert = Alert(**alert_in.model_dump(exclude_unset=True))
        db.add(alert)
        if commit:
            db.commit()
            db.refresh(alert)
        else:
            db.flush()
        return alert
    
    @staticmethod
    async def create_alert_with_notification(
        db: Session,
        alert_in: AlertCreate,
        mobile_engine,
        *,
        commit: bool = True
    ) -> Dict[str, Any]:
        """
        Create an alert AND send a gentle support notification.
        
        Uses the unified notification table. The notification is warm and 
        supportive - it does NOT reveal:
        - High-risk classification
        - Unusual emotional patterns
        - Anything clinical or alarming
        
        Returns:
            Dict with 'alert' and 'notification_result' keys
        """
        from app.services.push_notification_service import send_wellness_reminder
        
        # First create the alert
        alert = AlertService.create_alert(db, alert_in, commit=commit)
        
        # Then send the gentle notification using unified service
        notification_result = await send_wellness_reminder(
            mobile_engine=mobile_engine,
            alert_id=alert.alert_id
        )
        
        logger.info(f"Alert {alert.alert_id} created with notification: {notification_result.get('success')}")
        
        return {
            "alert": alert,
            "notification_result": notification_result
        }

    @staticmethod
    def update_alert(db: Session, alert: Alert, alert_in: AlertUpdate, *, commit: bool = True) -> Alert:
        for field, value in alert_in.model_dump(exclude_unset=True).items():
            setattr(alert, field, value)
        db.add(alert)
        if commit:
            db.commit()
            db.refresh(alert)
        else:
            db.flush()
        return alert

    @staticmethod
    def delete_alert(db: Session, alert: Alert, *, commit: bool = True) -> None:
        db.delete(alert)
        if commit:
            db.commit()
        else:
            db.flush()
