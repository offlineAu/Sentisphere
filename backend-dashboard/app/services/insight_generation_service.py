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
from app.utils.date_utils import safe_parse_datetime

from functools import lru_cache


@lru_cache(maxsize=1)
def _get_embed_model():
    try:
        from sentence_transformers import SentenceTransformer  # type: ignore
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
        "Terrible": 11,
        "Bad": 22,
        "Upset": 33,
        "Anxious": 44,
        "Meh": 55,
        "Okay": 66,
        "Great": 77,
        "Loved": 88,
        "Awesome": 100,
        # Backwards compatibility/aliases
        "Very Sad": 11,
        "Sad": 22,
        "Neutral": 50,
        "Good": 75,
        "Happy": 80,
        "Very Happy": 90,
        "Excellent": 100,
    }

    HIGH_STRESS_LABELS = {"High Stress", "Very High Stress"}
    NEGATIVE_MOODS = {"Very Sad", "Terrible", "Sad", "Bad", "Upset", "Anxious"}
    DISTRESS_KEYWORDS_EN = {"suicide", "kill myself", "want to die", "end it all", "no point", "hopeless", "worthless"}

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
    def _match_keywords(texts: List[str]) -> Tuple[List[str], List[str]]:
        """Match keywords and return (concepts, distress_keywords)."""
        mapping = InsightGenerationService._load_bisaya_mapping()
        found: set[str] = set()
        distress_found: set[str] = set()
        low = {k.lower(): v for k, v in mapping.items()} if mapping else {}
        
        for t in texts:
            if not t:
                continue
            lt = t.lower()
            # Check Bisaya keywords
            for phrase, concept in low.items():
                if phrase in lt:
                    found.add(concept)
            # Check English distress keywords
            for kw in InsightGenerationService.DISTRESS_KEYWORDS_EN:
                if kw in lt:
                    distress_found.add(kw)
        return sorted(found), sorted(distress_found)

    @staticmethod
    def _detect_streaks(daily_flags: Dict[str, bool], min_length: int = 3) -> List[Dict[str, Any]]:
        """Detect consecutive day streaks where flag is True."""
        streaks: List[Dict[str, Any]] = []
        sorted_days = sorted(daily_flags.keys())
        current_streak_start: Optional[str] = None
        current_length = 0

        for i, day in enumerate(sorted_days):
            if daily_flags[day]:
                if current_streak_start is None:
                    current_streak_start = day
                current_length += 1
            else:
                if current_length >= min_length:
                    streaks.append({
                        "start": current_streak_start,
                        "end": sorted_days[i - 1],
                        "length": current_length
                    })
                current_streak_start = None
                current_length = 0

        # Handle streak at end
        if current_length >= min_length and current_streak_start:
            streaks.append({
                "start": current_streak_start,
                "end": sorted_days[-1],
                "length": current_length
            })

        return streaks

    @staticmethod
    def _longest_streak_length(daily_flags: Dict[str, bool]) -> int:
        """Get the longest streak of consecutive True days."""
        streaks = InsightGenerationService._detect_streaks(daily_flags, min_length=1)
        return max((s["length"] for s in streaks), default=0)

    @staticmethod
    def _detect_sudden_drops(daily: List[Dict[str, Any]], threshold: int = 20) -> List[Dict[str, Any]]:
        """Detect sudden mood drops between consecutive days."""
        drops: List[Dict[str, Any]] = []
        for i in range(1, len(daily)):
            prev = daily[i - 1]["avg_mood_score"]
            cur = daily[i]["avg_mood_score"]
            drop = prev - cur
            if drop >= threshold:
                drops.append({
                    "date": daily[i]["date"],
                    "from": prev,
                    "to": cur,
                    "drop": drop
                })
        return drops

    @staticmethod
    def _compute_feel_better_streak(checkins: List[Dict[str, Any]]) -> int:
        """Count consecutive 'No' responses for feel_better."""
        by_day: Dict[str, List[str]] = defaultdict(list)
        for c in checkins:
            dt = safe_parse_datetime(c.get("created_at"))
            fb = c.get("feel_better")
            if not fb or not dt:
                continue
            d = dt.date().isoformat()
            by_day[d].append(fb)
        
        # Check majority per day
        daily_no: Dict[str, bool] = {}
        for day, vals in by_day.items():
            no_count = sum(1 for v in vals if v == "No")
            daily_no[day] = no_count > len(vals) // 2
        
        return InsightGenerationService._longest_streak_length(daily_no)

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
            keys, _ = InsightGenerationService._match_keywords(snippets)
            return [{"label": k, "count": 1, "examples": []} for k in keys]

        model = _get_embed_model()
        if not model:
            keys, _ = InsightGenerationService._match_keywords(snippets)
            return [{"label": k, "count": 1, "examples": []} for k in keys]

        try:
            import numpy as _np  # type: ignore
            from sklearn.cluster import KMeans  # type: ignore
        except Exception:
            keys, _ = InsightGenerationService._match_keywords(snippets)
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
            dt = safe_parse_datetime(c.get("created_at"))
            if not dt:
                continue
            d = dt.date().isoformat()
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
        # Normalize sentiments: treat strongly_negative as negative
        normalized = []
        for s in items:
            s_lower = str(s).lower()
            if s_lower == "strongly_negative":
                normalized.append("negative")
            elif s_lower in ("positive", "neutral", "negative"):
                normalized.append(s_lower)
        
        c = Counter(normalized)
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
        alerts: List[Dict[str, Any]],
        late_night_count: int,
        high_stress_streak: int = 0,
        negative_mood_streak: int = 0,
        feel_better_no_streak: int = 0,
        sudden_drops: List[Dict[str, Any]] = None,
        distress_keywords: List[str] = None,
    ) -> Tuple[int, str, str]:
        """Enhanced risk scoring with weighted factors."""
        points = 0
        reasons: List[str] = []
        sudden_drops = sudden_drops or []
        distress_keywords = distress_keywords or []

        # 1. Negative sentiment days
        neg_days = sum(1 for _d, cnt in sentiment_by_day.items() if cnt.get("negative", 0) >= max(cnt.get("positive", 0), 1))
        if neg_days >= 5:
            points += 4
            reasons.append(f"extended_negative_period={neg_days}")
        elif neg_days >= 3:
            points += 2
            reasons.append(f"negative_days={neg_days}")

        # 2. High-stress streak detection
        if high_stress_streak >= 5:
            points += 5
            reasons.append(f"high_stress_streak={high_stress_streak}")
        elif high_stress_streak >= 3:
            points += 3
            reasons.append(f"high_stress_days={high_stress_streak}")

        # 3. Alert severity weighting
        critical_alerts = sum(1 for a in alerts if str(a.get("severity")).lower() == "critical")
        high_alerts = sum(1 for a in alerts if str(a.get("severity")).lower() == "high")
        if critical_alerts > 0:
            points += 5 + min(critical_alerts - 1, 3)  # Cap at +8
            reasons.append(f"critical_alerts={critical_alerts}")
        if high_alerts > 0:
            points += 3 + min(high_alerts - 1, 2)  # Cap at +5
            reasons.append(f"high_alerts={high_alerts}")

        # 4. Late-night journaling pattern
        if late_night_count >= 5:
            points += 3
            reasons.append(f"late_night_journaling={late_night_count}")
        elif late_night_count >= 3:
            points += 2
            reasons.append(f"late_night_journals={late_night_count}")

        # 5. Sudden mood drop detection
        if sudden_drops:
            max_drop = max(d["drop"] for d in sudden_drops)
            if max_drop >= 30:
                points += 4
                reasons.append(f"severe_mood_drop={max_drop}")
            elif max_drop >= 20:
                points += 2
                reasons.append(f"sudden_mood_drop={max_drop}")

        # 6. "Feel Better = No" streak
        if feel_better_no_streak >= 5:
            points += 3
            reasons.append(f"no_improvement_streak={feel_better_no_streak}")
        elif feel_better_no_streak >= 3:
            points += 2
            reasons.append(f"feel_better_no_streak={feel_better_no_streak}")

        # 7. Negative mood streak
        if negative_mood_streak >= 5:
            points += 4
            reasons.append(f"negative_mood_streak={negative_mood_streak}")
        elif negative_mood_streak >= 3:
            points += 2
            reasons.append(f"neg_mood_days={negative_mood_streak}")

        # 8. Distress keywords (Bisaya/English)
        keyword_count = len(distress_keywords)
        if keyword_count >= 3:
            points += 3
            reasons.append(f"distress_keywords={keyword_count}")
        elif keyword_count >= 1:
            points += 2
            reasons.append(f"keyword_flag={distress_keywords[0]}")

        # Determine level
        if points <= 3:
            level = "low"
        elif points <= 7:
            level = "medium"
        elif points <= 11:
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

        # Keyword concepts and distress detection
        redacted_texts = [j.get("redacted_excerpt") or "" for j in journals]
        keyword_concepts, distress_keywords = InsightGenerationService._match_keywords(redacted_texts)
        journal_themes = InsightGenerationService._cluster_journal_themes(redacted_texts)

        # Risk factors (for metadata and recommendation)
        sentiment_by_day: Dict[str, Counter] = defaultdict(Counter)
        for s in journals:
            dt = safe_parse_datetime(s.get("created_at"))
            if not dt:
                continue
            d = dt.date().isoformat()
            sent = (s.get("sentiment") or "").lower()
            if sent:
                sentiment_by_day[d][sent] += 1
        
        stress_by_day: Dict[str, int] = defaultdict(int)
        daily_high_stress: Dict[str, bool] = {}
        daily_negative_mood: Dict[str, bool] = {}
        
        for c in checkins:
            dt = safe_parse_datetime(c.get("created_at"))
            if not dt:
                continue
            d = dt.date().isoformat()
            if (c.get("stress_level") or "") in InsightGenerationService.HIGH_STRESS_LABELS:
                stress_by_day[d] += 1
                daily_high_stress[d] = True
            else:
                daily_high_stress.setdefault(d, False)
            if (c.get("mood_level") or "") in InsightGenerationService.NEGATIVE_MOODS:
                daily_negative_mood[d] = True
            else:
                daily_negative_mood.setdefault(d, False)
        
        # Calculate streaks
        high_stress_streak = InsightGenerationService._longest_streak_length(daily_high_stress)
        negative_mood_streak = InsightGenerationService._longest_streak_length(daily_negative_mood)
        feel_better_no_streak = InsightGenerationService._compute_feel_better_streak(checkins)
        
        # Detect sudden mood drops
        sudden_drops = InsightGenerationService._detect_sudden_drops(daily)
        
        # Late night journaling
        late_night_count = 0
        for j in journals:
            t = safe_parse_datetime(j.get("created_at"))
            if t and 0 <= t.hour <= 4:
                late_night_count += 1
            dt = j.get("created_at")
            try:
                t = datetime.fromisoformat(dt) if isinstance(dt, str) else dt
                if isinstance(t, datetime) and 0 <= t.hour <= 4:
                    late_night_count += 1
            except Exception:
                continue
        
        # Enhanced risk scoring
        score, reason, level = InsightGenerationService._risk_score(
            sentiment_by_day=sentiment_by_day,
            stress_by_day=stress_by_day,
            alerts=alerts,
            late_night_count=late_night_count,
            high_stress_streak=high_stress_streak,
            negative_mood_streak=negative_mood_streak,
            feel_better_no_streak=feel_better_no_streak,
            sudden_drops=sudden_drops,
            distress_keywords=distress_keywords,
        )

        # Week average and change calculation
        all_vals = [d["avg_mood_score"] for d in daily]
        week_avg = round(sum(all_vals) / len(all_vals), 2) if all_vals else 0
        
        # Calculate week-over-week change (if we have enough data)
        # This compares first half vs second half of the period
        prev_week_avg = None
        change_percent = None
        if len(daily) >= 4:
            mid = len(daily) // 2
            first_half = [d["avg_mood_score"] for d in daily[:mid]]
            second_half = [d["avg_mood_score"] for d in daily[mid:]]
            if first_half and second_half:
                prev_week_avg = round(sum(first_half) / len(first_half), 2)
                curr_half_avg = round(sum(second_half) / len(second_half), 2)
                if prev_week_avg > 0:
                    # Calculate percentage change, capped at reasonable bounds
                    raw_change = (curr_half_avg - prev_week_avg) / prev_week_avg * 100
                    # Cap at -100% to +100% for display purposes
                    change_percent = round(max(-100, min(100, raw_change)), 1)

        # Streaks data for output
        streaks_data = {
            "high_stress_consecutive_days": high_stress_streak,
            "negative_mood_consecutive_days": negative_mood_streak,
            "feel_better_no_streak": feel_better_no_streak,
        }

        # What improved / What declined analysis
        what_improved: List[str] = []
        what_declined: List[str] = []
        
        if trend == "improving":
            what_improved.append("overall_mood")
        elif trend == "worsening":
            what_declined.append("overall_mood")
        
        if high_stress_streak == 0 and sum(stress_by_day.values()) < 2:
            what_improved.append("stress_management")
        elif high_stress_streak >= 3:
            what_declined.append("stress_levels")
        
        # Check energy trend
        high_energy = energy_dist.get("High", 0)
        low_energy = energy_dist.get("Low", 0)
        if high_energy > low_energy:
            what_improved.append("energy_levels")
        elif low_energy > high_energy:
            what_declined.append("energy_levels")

        # Summary + recommendation (rule-based; no LLM dependency)
        if trend == "improving":
            title = "Wellness Surge"
            summary = f"Mood improved over the period with a {abs(change_percent or 0):.0f}% positive change." if change_percent else "Mood improved over the period."
            recommendation = "Continue supportive routines and acknowledge positive changes."
        elif trend == "worsening":
            title = "Wellness Dip"
            summary = f"Mood declined {abs(change_percent or 0):.0f}% over the period with elevated stress levels." if change_percent else "Mood declined over the period."
            recommendation = "Consider proactive outreach and targeted check-ins for struggling students."
        else:
            title = "Stable Wellness"
            summary = "Mood trend was stable with consistent patterns observed."
            recommendation = "Maintain consistent engagement and monitor for emerging concerns."

        if level == "critical":
            recommendation = "URGENT: Immediate outreach required. Review critical alerts and high-risk patterns."
        elif level == "high":
            recommendation = "Prioritize outreach to flagged students and review recent alerts and high-stress patterns."

        data: Dict[str, Any] = {
            "title": title,
            "summary": summary,
            "dominant_emotions": dominant_emotions,
            "mood_trends": {
                "daily": daily,
                "trend": trend,
                "week_avg": week_avg,
                "prev_week_avg": prev_week_avg,
                "change_percent": change_percent,
            },
            "sentiment_breakdown": sentiment_breakdown,
            "stress_energy_patterns": stress_energy_patterns,
            "streaks": streaks_data,
            "sudden_drops": sudden_drops,
            "top_concerns": keyword_concepts,
            "triggers_detected": distress_keywords,
            "journal_themes": journal_themes,
            "what_improved": what_improved,
            "what_declined": what_declined,
            "recommendations": [recommendation],
            "metadata": {
                "risk_level": level,
                "risk_score": score,
                "risk_reasoning": reason,
                "week_avg": week_avg,
                "journal_count": len(journals),
                "checkin_count": len(checkins),
                "alerts_count": len(alerts),
                "generated_at": datetime.utcnow().isoformat() + "Z",
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
            safe_parse_datetime(c.get("created_at")).date().isoformat()
            for c in checkins
            if safe_parse_datetime(c.get("created_at")) and str(c.get("stress_level")) in InsightGenerationService.HIGH_STRESS_LABELS
        })

        late_night_journals = sum(
            1
            for j in journals
            if (lambda t: t and 0 <= t.hour <= 4)(
                safe_parse_datetime(j.get("created_at"))
            )
        )

        # Calculate streaks for behavioral analysis
        daily_high_stress: Dict[str, bool] = {}
        daily_negative_mood: Dict[str, bool] = {}
        stress_by_day: Dict[str, int] = defaultdict(int)
        sentiment_by_day: Dict[str, Counter] = defaultdict(Counter)
        
        for c in checkins:
            dt = safe_parse_datetime(c.get("created_at"))
            if not dt:
                continue
            d = dt.date().isoformat()
            if str(c.get("stress_level")) in InsightGenerationService.HIGH_STRESS_LABELS:
                daily_high_stress[d] = True
                stress_by_day[d] += 1
            else:
                daily_high_stress.setdefault(d, False)
            if str(c.get("mood_level")) in InsightGenerationService.NEGATIVE_MOODS:
                daily_negative_mood[d] = True
            else:
                daily_negative_mood.setdefault(d, False)
            sent = str(c.get("sentiment") or "").lower()
            if sent:
                sentiment_by_day[d][sent] += 1
        
        for j in journals:
            dt = safe_parse_datetime(j.get("created_at"))
            if not dt:
                continue
            d = dt.date().isoformat()
            sent = str(j.get("sentiment") or "").lower()
            if sent:
                sentiment_by_day[d][sent] += 1
        
        high_stress_streak = InsightGenerationService._longest_streak_length(daily_high_stress)
        negative_mood_streak = InsightGenerationService._longest_streak_length(daily_negative_mood)
        feel_better_no_streak = InsightGenerationService._compute_feel_better_streak(checkins)
        sudden_drops = InsightGenerationService._detect_sudden_drops(daily)
        
        # Distress keyword detection
        redacted_texts = [j.get("redacted_excerpt") or "" for j in journals]
        _, distress_keywords = InsightGenerationService._match_keywords(redacted_texts)
        
        risk_flags = {
            "negative_sentiment_ratio_percent": negative_ratio,
            "high_stress_days": high_stress_days,
            "high_stress_streak": high_stress_streak,
            "negative_mood_streak": negative_mood_streak,
            "feel_better_no_streak": feel_better_no_streak,
            "late_night_journals": late_night_journals,
            "sudden_mood_drops": len(sudden_drops),
            "distress_keywords_found": len(distress_keywords),
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
            t = safe_parse_datetime(item.get("created_at"))
            if not t:
                continue
            tod_cnt[tod_bucket(t)] += 1
            dow_cnt[t.weekday()] += 1  # 0=Mon
        behavioral_clusters = {
            "time_of_day": dict(tod_cnt),
            "day_of_week": {str(k): v for k, v in dow_cnt.items()},
        }

        # Enhanced risk scoring
        score, reason, level = InsightGenerationService._risk_score(
            sentiment_by_day=sentiment_by_day,
            stress_by_day=stress_by_day,
            alerts=alerts,
            late_night_count=late_night_journals,
            high_stress_streak=high_stress_streak,
            negative_mood_streak=negative_mood_streak,
            feel_better_no_streak=feel_better_no_streak,
            sudden_drops=sudden_drops,
            distress_keywords=distress_keywords,
        )

        # Recommendation based on risk level
        if level == "critical":
            recommendation = "URGENT: Immediate behavioral intervention required. Critical patterns detected."
        elif level == "high":
            recommendation = "Prioritize outreach and coping strategies; monitor high-stress days and negative sentiment spikes."
        elif level == "medium":
            recommendation = "Monitor behavioral patterns closely; consider preventive check-ins."
        else:
            recommendation = "Encourage consistent routines; continue positive engagement."

        # Themes via embeddings (if available)
        themes = InsightGenerationService._cluster_journal_themes(redacted_texts)

        data: Dict[str, Any] = {
            "recurring_emotional_patterns": recurring_emotional_patterns,
            "irregular_changes": irregular_changes,
            "sudden_drops": sudden_drops,
            "risk_flags": risk_flags,
            "behavioral_clusters": behavioral_clusters,
            "themes": themes,
            "recommendation": recommendation,
            "metadata": {
                "risk_level": level,
                "risk_score": score,
                "risk_reasoning": reason,
                "journal_count": len(journals),
                "checkin_count": len(checkins),
                "alerts_count": len(alerts),
                "generated_at": datetime.utcnow().isoformat() + "Z",
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
