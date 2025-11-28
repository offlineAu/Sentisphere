from __future__ import annotations

import json
import os
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, date
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.database import engine
from app.utils.text_cleaning import clean_text

try:
    from sentence_transformers import SentenceTransformer  # type: ignore
    _HAS_ST = True
except Exception:  # pragma: no cover
    _HAS_ST = False
    SentenceTransformer = None  # type: ignore

try:
    import numpy as _np  # type: ignore
    from sklearn.cluster import KMeans  # type: ignore
    _HAS_SK = True
except Exception:  # pragma: no cover
    _HAS_SK = False

from functools import lru_cache


@lru_cache(maxsize=1)
def _get_embed_model():
    if not _HAS_ST:
        return None
    try:
        return SentenceTransformer("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
    except Exception:
        return None

_BISAYA_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "bisaya_keywords.json")


@dataclass
class InsightComputationResult:
    data: Dict[str, Any]
    risk_level: str
    metadata: Dict[str, Any]


class InsightGenerationService:
    MOOD_SCORE_MAP: Dict[str, int] = {
        "Very Sad": 10,
        "Sad": 25,
        "Neutral": 50,
        "Good": 75,
        "Happy": 90,
        "Very Happy": 95,
        "Excellent": 100,
    }

    HIGH_STRESS_LABELS = {"High Stress", "Very High Stress"}

    @staticmethod
    def _ensure_table() -> None:
        ddl = (
            """
            CREATE TABLE IF NOT EXISTS `ai_insights` (
              `insight_id` INT PRIMARY KEY AUTO_INCREMENT,
              `user_id` INT DEFAULT NULL,
              `type` ENUM('weekly', 'behavioral') NOT NULL,
              `timeframe_start` DATE NOT NULL,
              `timeframe_end` DATE NOT NULL,
              `data` JSON NOT NULL,
              `risk_level` ENUM('low','medium','high','critical') DEFAULT 'low',
              `generated_by` VARCHAR(100),
              `generated_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
              UNIQUE KEY `uniq_insight` (`user_id`, `type`, `timeframe_start`, `timeframe_end`),
              FOREIGN KEY (`user_id`) REFERENCES `user`(`user_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
        with engine.connect() as conn:
            conn.execute(text(ddl))
            conn.commit()

    @staticmethod
    def _load_bisaya_mapping() -> Dict[str, str]:
        try:
            with open(_BISAYA_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}

    @staticmethod
    def _redact(text_value: str) -> str:
        if not text_value:
            return text_value
        s = text_value
        s = re.sub(r"[A-Za-z0-9_.+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]+", "[REDACTED]", s)
        s = re.sub(r"\b\+?\d[\d\s-]{7,}\b", "[REDACTED]", s)
        s = re.sub(r"\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b", "[REDACTED]", s)
        return s

    @staticmethod
    def _match_keywords(texts: List[str]) -> List[str]:
        mapping = InsightGenerationService._load_bisaya_mapping()
        if not mapping:
            return []
        found: set[str] = set()
        low = {k.lower(): v for k, v in mapping.items()}
        for t in texts:
            if not t:
                continue
            lt = t.lower()
            for phrase, concept in low.items():
                if phrase in lt:
                    found.add(concept)
        return sorted(found)

    @staticmethod
    def _cluster_journal_themes(texts: List[str], max_k: int = 4) -> List[dict]:
        """Cluster redacted journal snippets into coarse themes using multilingual embeddings.

        Returns list of { label, count, examples } dicts. Fallback to keyword-only when
        embeddings are unavailable or insufficient data.
        """
        snippets = [clean_text(t) for t in texts if t]
        snippets = [s for s in snippets if len(s) >= 10]
        if len(snippets) < 3:
            # too few items; just map keywords
            keys = InsightGenerationService._match_keywords(snippets)
            return [{"label": k, "count": 1, "examples": []} for k in keys]

        model = _get_embed_model()
        if not model or not _HAS_SK:
            keys = InsightGenerationService._match_keywords(snippets)
            return [{"label": k, "count": 1, "examples": []} for k in keys]

        vecs = model.encode(snippets, normalize_embeddings=False)
        arr = _np.asarray(vecs)
        k = min(max_k, max(2, min(5, int(round(len(snippets) ** 0.5)))))
        try:
            km = KMeans(n_clusters=k, n_init=10, random_state=42)
            labels = km.fit_predict(arr)
        except Exception:
            labels = _np.zeros(len(snippets), dtype=int)

        # crude token scorer per cluster
        stop = {"the","and","this","that","with","for","from","ang","mga","sa","nga","ako","imo","ikaw","siya"}
        clusters: dict[int, list[str]] = defaultdict(list)
        for s, lb in zip(snippets, labels):
            clusters[int(lb)].append(s)

        out: list[dict] = []
        for lb, items in clusters.items():
            tok_counter: Counter = Counter()
            for it in items:
                for tok in it.split():
                    if len(tok) >= 4 and tok not in stop:
                        tok_counter[tok] += 1
            top = [w for w, _ in tok_counter.most_common(3)]
            label = ", ".join(top) if top else "general"
            # try mapping known keyword concepts for a friendlier label
            concepts = InsightGenerationService._match_keywords(items)
            if concepts:
                label = concepts[0]
            out.append({
                "label": label,
                "count": len(items),
                "examples": items[:3],
            })
        out.sort(key=lambda d: d["count"], reverse=True)
        return out

    @staticmethod
    def _daily_avg_mood(checkins: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        by_day: Dict[str, List[int]] = defaultdict(list)
        for c in checkins:
            dt = c.get("created_at")
            try:
                d = (datetime.fromisoformat(dt) if isinstance(dt, str) else dt).date().isoformat()
            except Exception:
                continue
            mood = c.get("mood_level")
            if mood in InsightGenerationService.MOOD_SCORE_MAP:
                by_day[d].append(InsightGenerationService.MOOD_SCORE_MAP[mood])
        daily = []
        for day in sorted(by_day.keys()):
            vals = by_day[day]
            if not vals:
                continue
            avg = round(sum(vals) / len(vals), 2)
            daily.append({"date": day, "avg_mood_score": int(round(avg))})
        return daily

    @staticmethod
    def _trend_label(daily: List[Dict[str, Any]]) -> str:
        if len(daily) < 2:
            return "stable"
        first = daily[0]["avg_mood_score"]
        last = daily[-1]["avg_mood_score"]
        if last - first > 3:
            return "improving"
        if first - last > 3:
            return "worsening"
        return "stable"

    @staticmethod
    def _sentiment_counts(items: List[str]) -> Dict[str, int]:
        c = Counter([str(s).lower() for s in items if s in ("positive", "neutral", "negative")])
        return {"positive": c.get("positive", 0), "neutral": c.get("neutral", 0), "negative": c.get("negative", 0)}

    @staticmethod
    def _collect_emotions(journal_items: List[Dict[str, Any]], checkin_items: List[Dict[str, Any]]) -> Counter:
        cnt: Counter = Counter()
        def add_e(em):
            if not em:
                return
            try:
                obj = json.loads(em) if isinstance(em, str) else em
                if isinstance(obj, dict):
                    for k, v in obj.items():
                        if isinstance(v, (int, float)):
                            cnt[k] += float(v)
                        else:
                            cnt[k] += 1
                elif isinstance(obj, list):
                    for k in obj:
                        cnt[str(k)] += 1
            except Exception:
                # if not JSON, treat as label
                cnt[str(em)] += 1
        for j in journal_items:
            add_e(j.get("emotions"))
        for c in checkin_items:
            add_e(c.get("emotions"))
        return cnt

    @staticmethod
    def _risk_score(
        *,
        sentiment_by_day: Dict[str, Counter],
        stress_by_day: Dict[str, int],
        high_alert_present: bool,
        late_night_count: int,
    ) -> Tuple[int, str, str]:
        points = 0
        reasons: List[str] = []
        neg_days = sum(1 for _d, cnt in sentiment_by_day.items() if cnt.get("negative", 0) >= max(cnt.get("positive", 0), 1))
        if neg_days >= 3:
            points += 2
            reasons.append(f"negative_days>={neg_days}")
        high_stress_days = sum(1 for _d, count in stress_by_day.items() if count >= 1)
        if high_stress_days >= 3:
            points += 3
            reasons.append(f"high_stress_days={high_stress_days}")
        if high_alert_present:
            points += 4
            reasons.append("high_or_critical_alert_present")
        if late_night_count >= 3:
            points += 2
            reasons.append(f"late_night_journaling={late_night_count}")
        if points <= 2:
            level = "low"
        elif points <= 5:
            level = "medium"
        elif points <= 8:
            level = "high"
        else:
            level = "critical"
        return points, ";".join(reasons), level

    @staticmethod
    def _compute_weekly(
        *,
        user_id: Optional[int],
        payload: Dict[str, Any],
        tf_start: date,
        tf_end: date,
    ) -> InsightComputationResult:
        journals = payload.get("journals") or []
        checkins = payload.get("checkins") or []
        alerts = payload.get("alerts") or []

        # Daily averages + trend
        daily = InsightGenerationService._daily_avg_mood(checkins)
        trend = InsightGenerationService._trend_label(daily)

        # Sentiments
        sentiments: List[str] = []
        sentiments.extend([str(j.get("sentiment")).lower() for j in journals if j.get("sentiment")])
        sentiments.extend([str(c.get("sentiment")).lower() for c in checkins if c.get("sentiment")])
        sentiment_breakdown = InsightGenerationService._sentiment_counts(sentiments)

        # Emotions
        emotion_counts = InsightGenerationService._collect_emotions(journals, checkins)
        dominant_emotions = [k for k, _v in emotion_counts.most_common(5)]

        # Stress & energy distributions
        stress_dist: Counter = Counter([c.get("stress_level") for c in checkins if c.get("stress_level")])
        energy_dist: Counter = Counter([c.get("energy_level") for c in checkins if c.get("energy_level")])
        stress_energy_patterns = {
            "stress": dict(stress_dist),
            "energy": dict(energy_dist),
        }

        # Keyword concepts
        redacted_texts = [j.get("redacted_excerpt") or "" for j in journals]
        keyword_concepts = InsightGenerationService._match_keywords(redacted_texts)
        journal_themes = InsightGenerationService._cluster_journal_themes(redacted_texts)

        # Risk factors (for metadata and recommendation)
        sentiment_by_day: Dict[str, Counter] = defaultdict(Counter)
        for s in journals:
            dt = s.get("created_at")
            try:
                d = (datetime.fromisoformat(dt) if isinstance(dt, str) else dt).date().isoformat()
            except Exception:
                continue
            sent = (s.get("sentiment") or "").lower()
            if sent:
                sentiment_by_day[d][sent] += 1
        stress_by_day: Dict[str, int] = defaultdict(int)
        for c in checkins:
            dt = c.get("created_at")
            try:
                d = (datetime.fromisoformat(dt) if isinstance(dt, str) else dt).date().isoformat()
            except Exception:
                continue
            if (c.get("stress_level") or "") in InsightGenerationService.HIGH_STRESS_LABELS:
                stress_by_day[d] += 1
        high_alert_present = any((str(a.get("severity")).lower() in ("high", "critical")) for a in alerts)
        late_night_count = 0
        for j in journals:
            dt = j.get("created_at")
            try:
                t = datetime.fromisoformat(dt) if isinstance(dt, str) else dt
            except Exception:
                continue
            if 0 <= t.hour <= 4:
                late_night_count += 1
        score, reason, level = InsightGenerationService._risk_score(
            sentiment_by_day=sentiment_by_day,
            stress_by_day=stress_by_day,
            high_alert_present=high_alert_present,
            late_night_count=late_night_count,
        )

        # Week average
        all_vals = [d["avg_mood_score"] for d in daily]
        week_avg = round(sum(all_vals) / len(all_vals), 2) if all_vals else 0

        # Summary + recommendation (rule-based; no LLM dependency)
        if trend == "improving":
            title = "Wellness Surge"
            summary = "Mood improved over the period."
            recommendation = "Continue supportive routines and acknowledge positive changes."
        elif trend == "worsening":
            title = "Wellness Dip"
            summary = "Mood declined over the period."
            recommendation = "Consider proactive outreach and targeted check-ins for struggling students."
        else:
            title = "Stable Wellness"
            summary = "Mood trend was stable."
            recommendation = "Maintain consistent engagement and monitor for emerging concerns."

        if level in ("high", "critical"):
            recommendation = "Prioritize outreach to flagged students and review recent alerts and high-stress patterns."

        data: Dict[str, Any] = {
            "title": title,
            "summary": summary,
            "dominant_emotions": dominant_emotions,
            "mood_trends": {"daily": daily, "trend": trend},
            "stress_energy_patterns": stress_energy_patterns,
            "top_concerns": keyword_concepts,
            "journal_themes": journal_themes,
            "recommendation": recommendation,
            "metadata": {
                "risk_level": level,
                "risk_score": score,
                "risk_reasoning": reason,
                "week_avg": week_avg,
                "journal_count": len(journals),
                "checkin_count": len(checkins),
                "alerts_count": len(alerts),
            },
        }
        return InsightComputationResult(data=data, risk_level=level, metadata=data["metadata"]) 

    @staticmethod
    def _compute_behavioral(
        *,
        user_id: Optional[int],
        payload: Dict[str, Any],
        tf_start: date,
        tf_end: date,
    ) -> InsightComputationResult:
        journals = payload.get("journals") or []
        checkins = payload.get("checkins") or []
        alerts = payload.get("alerts") or []

        # Recurring emotional patterns (top emotions)
        emotion_counts = InsightGenerationService._collect_emotions(journals, checkins)
        recurring_emotional_patterns = [k for k, _ in emotion_counts.most_common(6)]

        # Irregular changes (day-to-day swings > 15 points)
        daily = InsightGenerationService._daily_avg_mood(checkins)
        irregular_changes: List[Dict[str, Any]] = []
        for i in range(1, len(daily)):
            prev = daily[i-1]
            cur = daily[i]
            dlt = cur["avg_mood_score"] - prev["avg_mood_score"]
            if abs(dlt) >= 15:
                irregular_changes.append({"date": cur["date"], "delta": dlt})

        # Risk flags
        neg_sentiments = 0
        total_sentiments = 0
        for j in journals:
            s = str(j.get("sentiment") or "").lower()
            if s:
                total_sentiments += 1
                if s == "negative":
                    neg_sentiments += 1
        for c in checkins:
            s = str(c.get("sentiment") or "").lower()
            if s:
                total_sentiments += 1
                if s == "negative":
                    neg_sentiments += 1
        negative_ratio = round((neg_sentiments / total_sentiments) * 100, 1) if total_sentiments else 0.0

        high_stress_days = len({
            (datetime.fromisoformat(c["created_at"]) if isinstance(c.get("created_at"), str) else c.get("created_at")).date().isoformat()
            for c in checkins
            if str(c.get("stress_level")) in InsightGenerationService.HIGH_STRESS_LABELS
        })

        late_night_journals = sum(
            1
            for j in journals
            if (lambda t: isinstance(t, datetime) and 0 <= t.hour <= 4)(
                datetime.fromisoformat(j["created_at"]) if isinstance(j.get("created_at"), str) else j.get("created_at")
            )
        )

        risk_flags = {
            "negative_sentiment_ratio_percent": negative_ratio,
            "high_stress_days": high_stress_days,
            "late_night_journals": late_night_journals,
        }

        # Simple clusters: time-of-day and day-of-week distributions
        def tod_bucket(dt: datetime) -> str:
            h = dt.hour
            if 0 <= h < 6:
                return "late_night"
            if 6 <= h < 12:
                return "morning"
            if 12 <= h < 18:
                return "afternoon"
            return "evening"

        tod_cnt: Counter = Counter()
        dow_cnt: Counter = Counter()
        for item in journals + checkins:
            dt = item.get("created_at")
            try:
                t = datetime.fromisoformat(dt) if isinstance(dt, str) else dt
            except Exception:
                continue
            tod_cnt[tod_bucket(t)] += 1
            dow_cnt[t.weekday()] += 1  # 0=Mon
        behavioral_clusters = {
            "time_of_day": dict(tod_cnt),
            "day_of_week": dict(dow_cnt),
        }

        # Recommendation & metadata
        recommendation = "Encourage consistent routines; address high-stress periods and watch negative sentiment trends."
        if negative_ratio >= 40 or high_stress_days >= 3:
            recommendation = "Prioritize outreach and coping strategies; monitor high-stress days and negative sentiment spikes."

        # Risk level heuristic
        level = "low"
        score = 0
        if negative_ratio >= 40:
            score += 3
        if high_stress_days >= 3:
            score += 3
        if late_night_journals >= 3:
            score += 2
        if score <= 2:
            level = "low"
        elif score <= 5:
            level = "medium"
        elif score <= 7:
            level = "high"
        else:
            level = "critical"

        # Themes via embeddings (if available)
        redacted_texts = [j.get("redacted_excerpt") or "" for j in journals]
        themes = InsightGenerationService._cluster_journal_themes(redacted_texts)

        data: Dict[str, Any] = {
            "recurring_emotional_patterns": recurring_emotional_patterns,
            "irregular_changes": irregular_changes,
            "risk_flags": risk_flags,
            "behavioral_clusters": behavioral_clusters,
            "themes": themes,
            "recommendation": recommendation,
            "metadata": {
                "risk_level": level,
                "risk_score": score,
                "journal_count": len(journals),
                "checkin_count": len(checkins),
                "alerts_count": len(alerts),
            },
        }
        return InsightComputationResult(data=data, risk_level=level, metadata=data["metadata"]) 

    @staticmethod
    def upsert_insight(
        *,
        db: Session,
        user_id: Optional[int],
        insight_type: str,
        tf_start: date,
        tf_end: date,
        data: Dict[str, Any],
        risk_level: str,
        generated_by: str = "fastapi_v1",
    ) -> int:
        InsightGenerationService._ensure_table()
        insert_sql = text(
            """
            INSERT INTO ai_insights (user_id, type, timeframe_start, timeframe_end, data, risk_level, generated_by, generated_at)
            VALUES (:user_id, :type, :timeframe_start, :timeframe_end, :data, :risk_level, :generated_by, NOW())
            ON DUPLICATE KEY UPDATE
              data = VALUES(data),
              risk_level = VALUES(risk_level),
              generated_by = VALUES(generated_by),
              generated_at = VALUES(generated_at)
            """
        )
        with engine.connect() as conn:
            res = conn.execute(
                insert_sql,
                {
                    "user_id": user_id,
                    "type": insight_type,
                    "timeframe_start": tf_start,
                    "timeframe_end": tf_end,
                    "data": json.dumps(data, ensure_ascii=False),
                    "risk_level": risk_level,
                    "generated_by": generated_by,
                },
            )
            conn.commit()
            return int(res.lastrowid or 0)

    @staticmethod
    def compute_and_store(
        *,
        db: Session,
        user_id: Optional[int],
        timeframe_start: date,
        timeframe_end: date,
        payload: Dict[str, Any],
        insight_type: str,
    ) -> Tuple[Dict[str, Any], bool]:
        journals = payload.get("journals") or []
        checkins = payload.get("checkins") or []
        if len(journals) + len(checkins) < 3:
            return {"reason": "insufficient_data", "preliminary": True}, False

        if insight_type == "weekly":
            core = InsightGenerationService._compute_weekly(
                user_id=user_id,
                payload=payload,
                tf_start=timeframe_start,
                tf_end=timeframe_end,
            )
        elif insight_type == "behavioral":
            core = InsightGenerationService._compute_behavioral(
                user_id=user_id,
                payload=payload,
                tf_start=timeframe_start,
                tf_end=timeframe_end,
            )
        else:
            return {"reason": "unsupported_type"}, False

        # Ensure no raw text is stored
        core.data.pop("redacted_excerpt", None)
        if "journals" in core.data:
            core.data.pop("journals", None)

        InsightGenerationService.upsert_insight(
            db=db,
            user_id=user_id,
            insight_type=insight_type,
            tf_start=timeframe_start,
            tf_end=timeframe_end,
            data=core.data,
            risk_level=core.risk_level,
        )
        return core.data, True
