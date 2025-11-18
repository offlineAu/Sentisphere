from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db.session import Base


class UserActivity(Base):
    __tablename__ = "user_activities"

    activity_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("user.user_id", ondelete="SET NULL"))
    action: Mapped[Optional[str]] = mapped_column(String(50))
    target_type: Mapped[Optional[str]] = mapped_column(String(50))
    target_id: Mapped[Optional[int]] = mapped_column(Integer)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    duration_seconds: Mapped[Optional[int]] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    user: Mapped[Optional["User"]] = relationship("User", back_populates="activities")
