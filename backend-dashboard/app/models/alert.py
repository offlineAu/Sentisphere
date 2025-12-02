from __future__ import annotations

from datetime import datetime
from enum import Enum as PyEnum
from typing import Optional

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db.session import Base


class AlertSeverity(str, PyEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class AlertStatus(str, PyEnum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"


class Alert(Base):
    __tablename__ = "alert"

    alert_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("user.user_id", ondelete="SET NULL"))
    reason: Mapped[Optional[str]] = mapped_column(String(255))
    severity: Mapped[AlertSeverity] = mapped_column(
        Enum(
            AlertSeverity,
            name="alert_severity",
            native_enum=False,
            values_callable=lambda e: [m.value for m in e],
            validate_strings=True,
        ),
        nullable=False,
    )
    assigned_to: Mapped[Optional[int]] = mapped_column(ForeignKey("user.user_id", ondelete="SET NULL"))
    status: Mapped[AlertStatus] = mapped_column(
        Enum(
            AlertStatus,
            name="alert_status",
            native_enum=False,
            values_callable=lambda e: [m.value for m in e],
            validate_strings=True,
        ),
        nullable=False,
        server_default="open",
    )
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    user: Mapped[Optional["User"]] = relationship(
        "User", back_populates="alerts", foreign_keys=[user_id]
    )
    assignee: Mapped[Optional["User"]] = relationship(
        "User", back_populates="assigned_alerts", foreign_keys=[assigned_to]
    )
