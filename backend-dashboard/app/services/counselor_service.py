from __future__ import annotations

from typing import Optional

from sqlalchemy import insert, select, update
from sqlalchemy.orm import Session

from app.models.counselor_profile import CounselorProfile
from app.models.user import User
from app.schemas.counselor_profile import CounselorProfilePayload, CounselorProfileResponse


class CounselorService:
    @staticmethod
    def get_profile(db: Session, user_id: int) -> Optional[CounselorProfileResponse]:
        stmt = (
            select(User, CounselorProfile)
            .join(CounselorProfile, CounselorProfile.user_id == User.user_id, isouter=True)
            .where(User.user_id == user_id)
        )
        row = db.execute(stmt).first()
        if not row:
            return None

        user, profile = row
        payload = {
            "user_id": user.user_id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "department": profile.department if profile else None,
            "contact_number": profile.contact_number if profile else None,
            "availability": profile.availability if profile else None,
            "year_experience": profile.year_experience if profile else None,
            "phone": profile.phone if profile else None,
            "license_number": profile.license_number if profile else None,
            "specializations": profile.specializations if profile else None,
            "education": profile.education if profile else None,
            "bio": profile.bio if profile else None,
            "languages": profile.languages if profile else None,
            "created_at": profile.created_at if profile else None,
        }
        return CounselorProfileResponse(**payload)

    @staticmethod
    def update_profile(
        db: Session,
        user_id: int,
        payload: CounselorProfilePayload,
    ) -> CounselorProfileResponse:
        user = db.get(User, user_id)
        if not user:
            raise ValueError("User not found")

        updates = payload.model_dump(exclude_unset=True)
        user_updates = {}
        profile_updates = {}

        if "name" in updates:
            user_updates["name"] = updates.pop("name")
        if "email" in updates:
            user_updates["email"] = updates.pop("email")

        profile_updates.update(updates)

        if user_updates:
            stmt = update(User).where(User.user_id == user_id).values(**user_updates)
            db.execute(stmt)

        profile = db.get(CounselorProfile, user_id)
        if profile:
            if profile_updates:
                stmt = (
                    update(CounselorProfile)
                    .where(CounselorProfile.user_id == user_id)
                    .values(**profile_updates)
                )
                db.execute(stmt)
        else:
            if profile_updates:
                stmt = insert(CounselorProfile).values(user_id=user_id, **profile_updates)
                db.execute(stmt)

        db.commit()
        return CounselorService.get_profile(db, user_id)  # type: ignore[return-value]
