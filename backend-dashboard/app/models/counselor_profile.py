from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db.session import Base


class CounselorProfile(Base):
    __tablename__ = "counselor_profile"

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user.user_id", ondelete="CASCADE"), primary_key=True
    )
    department: Mapped[Optional[str]] = mapped_column(String(100))
    contact_number: Mapped[Optional[str]] = mapped_column(String(20))
    availability: Mapped[Optional[str]] = mapped_column(String(100))
    year_experience: Mapped[Optional[int]] = mapped_column(Integer)
    phone: Mapped[Optional[str]] = mapped_column(String(50))
    license_number: Mapped[Optional[str]] = mapped_column(String(100))
    specializations: Mapped[Optional[str]] = mapped_column(Text)
    education: Mapped[Optional[str]] = mapped_column(Text)
    bio: Mapped[Optional[str]] = mapped_column(Text)
    languages: Mapped[Optional[str]] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    user: Mapped["User"] = relationship("User", back_populates="counselor_profile")
