from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class AppointmentLog(Base):
    __tablename__ = "appointment_log"

    log_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("user.user_id", ondelete="SET NULL"))
    form_type: Mapped[Optional[str]] = mapped_column(String(100))
    downloaded_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    remarks: Mapped[Optional[str]] = mapped_column(Text)

    user: Mapped[Optional["User"]] = relationship("User", back_populates="appointment_logs")
