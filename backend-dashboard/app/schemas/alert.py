from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.models.alert import AlertSeverity, AlertStatus


class AlertBase(BaseModel):
    reason: Optional[str] = None
    severity: AlertSeverity = AlertSeverity.LOW
    assigned_to: Optional[int] = None
    status: AlertStatus = AlertStatus.OPEN


class AlertCreate(AlertBase):
    user_id: Optional[int] = None


class AlertUpdate(BaseModel):
    reason: Optional[str] = None
    severity: Optional[AlertSeverity] = None
    assigned_to: Optional[int] = None
    status: Optional[AlertStatus] = None
    resolved_at: Optional[datetime] = None


class Alert(AlertBase):
    model_config = ConfigDict(from_attributes=True)

    alert_id: int
    user_id: Optional[int] = None
    resolved_at: Optional[datetime] = None
    created_at: datetime
