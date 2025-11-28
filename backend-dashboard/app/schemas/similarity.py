from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class SimilarJournal(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    journal_id: int
    user_id: Optional[int] = None
    created_at: datetime
    score: float
    snippet: str
