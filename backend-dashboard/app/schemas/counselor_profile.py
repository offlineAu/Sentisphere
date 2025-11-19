from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.models.user import UserRole


class CounselorProfileBase(BaseModel):
    department: Optional[str] = None
    contact_number: Optional[str] = None
    availability: Optional[str] = None
    year_experience: Optional[int] = None
    phone: Optional[str] = None
    license_number: Optional[str] = None
    specializations: Optional[str] = None
    education: Optional[str] = None
    bio: Optional[str] = None
    languages: Optional[str] = None


class CounselorProfileCreate(CounselorProfileBase):
    user_id: int


class CounselorProfileUpdate(CounselorProfileBase):
    pass


class CounselorProfile(CounselorProfileBase):
    model_config = ConfigDict(from_attributes=True)

    user_id: int
    created_at: Optional[datetime] = None


class CounselorProfilePayload(CounselorProfileBase):
    name: Optional[str] = None
    email: Optional[str] = None


class CounselorProfileResponse(CounselorProfileBase):
    model_config = ConfigDict(from_attributes=True)

    user_id: int
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[UserRole] = None
    created_at: Optional[datetime] = None
