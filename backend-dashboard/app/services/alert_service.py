from __future__ import annotations

from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.alert import Alert
from app.schemas.alert import AlertCreate, AlertUpdate


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
