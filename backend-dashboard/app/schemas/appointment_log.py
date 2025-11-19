from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class AppointmentLogBase(BaseModel):
    form_type: Optional[str] = None
    downloaded_at: Optional[datetime] = None
    remarks: Optional[str] = None


class AppointmentLogCreate(AppointmentLogBase):
    user_id: Optional[int] = None


class AppointmentLogUpdate(AppointmentLogBase):
    user_id: Optional[int] = None


class AppointmentLog(AppointmentLogBase):
    model_config = ConfigDict(from_attributes=True)

    log_id: int
    user_id: Optional[int] = None
