from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import List, Dict, Any, Optional, Tuple

import math

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.journal import Journal
from app.services.insight_generation_service import InsightGenerationService
from app.utils.text_cleaning import clean_text

try:
    from sentence_transformers import SentenceTransformer
    import numpy as np
    HAS_ST = True
except Exception:  # pragma: no cover
    HAS_ST = False
    SentenceTransformer = None  # type: ignore
    np = None  # type: ignore


@dataclass
class _EmbedModel:
    model: Any


@lru_cache(maxsize=1)
def _get_embed_model() -> Optional[_EmbedModel]:
    if not HAS_ST:
        return None
    model = SentenceTransformer("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
    return _EmbedModel(model=model)


def _cosine(a, b) -> float:
    if a is None or b is None:
        return 0.0
    denom = (float((a * a).sum()) ** 0.5) * (float((b * b).sum()) ** 0.5)
    if denom <= 0:
        return 0.0
    return float((a @ b) / denom)


class EmbeddingService:
    @staticmethod
    def _encode(texts: List[str]):
        m = _get_embed_model()
        if not m:
            return None
        vecs = m.model.encode(texts, normalize_embeddings=False)
        return vecs

    @staticmethod
    def similar_journals(
        db: Session,
        *,
        journal_id: int,
        top_k: int = 5,
        same_user_only: bool = False,
        window_days: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        base = db.get(Journal, journal_id)
        if not base or not base.content:
            return []
        stmt = select(Journal).where(Journal.journal_id != journal_id)
        if same_user_only and base.user_id is not None:
            stmt = stmt.where(Journal.user_id == base.user_id)
        others = list(db.scalars(stmt))
        if not others:
            return []

        base_text = clean_text(base.content)
        pool: List[Tuple[Journal, str]] = []
        pool.append((base, base_text))
        for j in others:
            t = clean_text(j.content or "")
            if t:
                pool.append((j, t))
        if len(pool) <= 1:
            return []

        enc = EmbeddingService._encode([txt for (_j, txt) in pool])
        if enc is None:
            return []

        import numpy as _np  # type: ignore
        arr = _np.asarray(enc)  # type: ignore
        base_vec = arr[0]
        scores = []
        for idx in range(1, arr.shape[0]):
            sim = _cosine(base_vec, arr[idx])
            j = pool[idx][0]
            scores.append((sim, j))
        scores.sort(key=lambda x: x[0], reverse=True)

        out: List[Dict[str, Any]] = []
        for sim, j in scores[:top_k]:
            snippet = (j.content or "").strip()[:200]
            snippet = InsightGenerationService._redact(snippet)
            out.append(
                {
                    "journal_id": int(j.journal_id),
                    "user_id": int(j.user_id) if j.user_id is not None else None,
                    "created_at": j.created_at,
                    "score": round(float(sim), 4),
                    "snippet": snippet,
                }
            )
        return out
