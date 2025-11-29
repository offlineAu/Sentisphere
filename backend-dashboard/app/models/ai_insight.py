from __future__ import annotations

from datetime import datetime, date
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, JSON, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db.session import Base


class InsightType(str):
    weekly = "weekly"
    behavioral = "behavioral"


class RiskLevel(str):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class AIInsight(Base):
    __tablename__ = "ai_insights"

    insight_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("user.user_id", ondelete="SET NULL"))
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    timeframe_start: Mapped[date] = mapped_column(Date, nullable=False)
    timeframe_end: Mapped[date] = mapped_column(Date, nullable=False)
    data: Mapped[dict] = mapped_column(JSON, nullable=False)
    risk_level: Mapped[Optional[str]] = mapped_column(String(20), default=RiskLevel.low)
    generated_by: Mapped[Optional[str]] = mapped_column(String(100))
    generated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    user = relationship("User", backref="ai_insights", lazy="joined")
