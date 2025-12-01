from __future__ import annotations

import hashlib
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import text

from app.db.database import engine
from app.services.insight_generation_service import InsightGenerationService


def _iso(dt: Optional[datetime]) -> Optional[str]:
    if not dt:
        return None
    try:
        return dt.isoformat(timespec="seconds")
    except Exception:
        return str(dt)


def discover_active_user_ids(start_dt: datetime, end_dt: datetime) -> List[int]:
    """Find users who had analyzed journals or check-ins in the given window."""
    sql = text(
        """
        SELECT DISTINCT u FROM (
          SELECT j.user_id AS u 
          FROM journal j
          JOIN journal_sentiment js ON js.journal_id = j.journal_id
          WHERE j.user_id IS NOT NULL 
            AND j.deleted_at IS NULL
            AND js.analyzed_at >= :start AND js.analyzed_at <= :end
          UNION ALL
          SELECT ec.user_id AS u 
          FROM emotional_checkin ec
          JOIN checkin_sentiment cs ON cs.checkin_id = ec.checkin_id
          WHERE ec.user_id IS NOT NULL 
            AND cs.analyzed_at >= :start AND cs.analyzed_at <= :end
        ) t
        WHERE u IS NOT NULL
        """
    )
    with engine.connect() as conn:
        rows = conn.execute(
            sql,
            {
                "start": start_dt.strftime("%Y-%m-%d %H:%M:%S"),
                "end": end_dt.strftime("%Y-%m-%d %H:%M:%S"),
            },
        ).all()
        return [int(r[0]) for r in rows]


def build_sanitized_payload(user_id: Optional[int], start_dt: datetime, end_dt: datetime) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "journals": [],
        "checkins": [],
        "alerts": [],
        "activities": [],
        "appointments": [],
    }

    # Journals - filter by analyzed_at to get only analyzed entries in the window
    journals_sql = text(
        """
        SELECT DISTINCT j.journal_id, j.user_id, j.content, j.created_at, js.analyzed_at
        FROM journal j
        JOIN journal_sentiment js ON js.journal_id = j.journal_id
        WHERE j.deleted_at IS NULL
          AND js.analyzed_at >= :start AND js.analyzed_at <= :end
          AND js.analyzed_at = (
            SELECT MAX(js2.analyzed_at) FROM journal_sentiment js2 WHERE js2.journal_id = j.journal_id
          )
        {user_filter}
        ORDER BY js.analyzed_at ASC
        """.format(user_filter=("AND j.user_id = :uid" if user_id is not None else ""))
    )
    params = {
        "start": start_dt.strftime("%Y-%m-%d %H:%M:%S"),
        "end": end_dt.strftime("%Y-%m-%d %H:%M:%S"),
    }
    if user_id is not None:
        params["uid"] = user_id

    with engine.connect() as conn:
        jr_rows = conn.execute(journals_sql, params).mappings().all()
        # Build sentiments map from the same query results
        sentiments_map: Dict[int, Dict[str, Any]] = {}
        if jr_rows:
            js_sql = text(
                """
                SELECT js.journal_id, js.sentiment, js.emotions, js.confidence, js.model_version, js.analyzed_at
                FROM journal_sentiment js
                JOIN journal j ON j.journal_id = js.journal_id
                WHERE j.deleted_at IS NULL
                  AND js.analyzed_at >= :start AND js.analyzed_at <= :end
                {user_filter}
                  AND js.analyzed_at = (
                    SELECT MAX(js2.analyzed_at) FROM journal_sentiment js2 WHERE js2.journal_id = js.journal_id
                  )
                """.format(user_filter=("AND j.user_id = :uid" if user_id is not None else ""))
            )
            for r in conn.execute(js_sql, params).mappings().all():
                sentiments_map[int(r["journal_id"])] = dict(r)

        for r in jr_rows:
            content = r["content"] or ""
            text_hash = hashlib.sha256(content.encode("utf-8", errors="ignore")).hexdigest()
            excerpt = InsightGenerationService._redact(content[:200])
            s = sentiments_map.get(int(r["journal_id"]))
            payload["journals"].append(
                {
                    "id": int(r["journal_id"]),
                    "text_hash": text_hash,
                    "redacted_excerpt": excerpt,
                    "analyzed": bool(s),
                    "sentiment": (s or {}).get("sentiment"),
                    "emotions": (s or {}).get("emotions"),
                    "created_at": _iso(r.get("created_at")),
                    "analyzed_at": _iso(r.get("analyzed_at")),
                }
            )

        # Check-ins - filter by analyzed_at, include feel_better field
        ck_rows = conn.execute(
            text(
                """
                SELECT DISTINCT ec.checkin_id, ec.user_id, ec.mood_level, ec.energy_level, 
                       ec.stress_level, ec.feel_better, ec.created_at, cs.analyzed_at
                FROM emotional_checkin ec
                JOIN checkin_sentiment cs ON cs.checkin_id = ec.checkin_id
                WHERE cs.analyzed_at >= :start AND cs.analyzed_at <= :end
                  AND cs.analyzed_at = (
                    SELECT MAX(cs2.analyzed_at) FROM checkin_sentiment cs2 WHERE cs2.checkin_id = ec.checkin_id
                  )
                {user_filter}
                ORDER BY cs.analyzed_at ASC
                """.format(user_filter=("AND ec.user_id = :uid" if user_id is not None else ""))
            ),
            params,
        ).mappings().all()
        cs_map: Dict[int, Dict[str, Any]] = {}
        if ck_rows:
            cs_sql = text(
                """
                SELECT cs.checkin_id, cs.sentiment, cs.emotions, cs.confidence, cs.model_version, cs.analyzed_at
                FROM checkin_sentiment cs
                JOIN emotional_checkin ec ON ec.checkin_id = cs.checkin_id
                WHERE cs.analyzed_at >= :start AND cs.analyzed_at <= :end
                {user_filter}
                  AND cs.analyzed_at = (
                    SELECT MAX(cs2.analyzed_at) FROM checkin_sentiment cs2 WHERE cs2.checkin_id = cs.checkin_id
                  )
                """.format(user_filter=("AND ec.user_id = :uid" if user_id is not None else ""))
            )
            for r in conn.execute(cs_sql, params).mappings().all():
                cs_map[int(r["checkin_id"])] = dict(r)

        for r in ck_rows:
            s = cs_map.get(int(r["checkin_id"]))
            payload["checkins"].append(
                {
                    "id": int(r["checkin_id"]),
                    "mood_level": r.get("mood_level"),
                    "energy_level": r.get("energy_level"),
                    "stress_level": r.get("stress_level"),
                    "feel_better": r.get("feel_better"),
                    "sentiment": (s or {}).get("sentiment"),
                    "emotions": (s or {}).get("emotions"),
                    "created_at": _iso(r.get("created_at")),
                    "analyzed_at": _iso(r.get("analyzed_at")),
                }
            )

        # Alerts
        al_rows = conn.execute(
            text(
                """
                SELECT severity, status, created_at
                FROM alert
                WHERE created_at >= :start AND created_at <= :end
                {user_filter}
                ORDER BY created_at ASC
                """.format(user_filter=("AND user_id = :uid" if user_id is not None else ""))
            ),
            params,
        ).mappings().all()
        for r in al_rows:
            payload["alerts"].append(
                {
                    "severity": r.get("severity"),
                    "status": r.get("status"),
                    "created_at": _iso(r.get("created_at")),
                }
            )

        # Activities (counts by action)
        act_rows = conn.execute(
            text(
                """
                SELECT action, COUNT(*) AS cnt
                FROM user_activities
                WHERE created_at >= :start AND created_at <= :end
                {user_filter}
                GROUP BY action
                """.format(user_filter=("AND user_id = :uid" if user_id is not None else ""))
            ),
            params,
        ).mappings().all()
        payload["activities"] = [
            {"action": r.get("action"), "count": int(r.get("cnt") or 0)} for r in act_rows
        ]

        # Appointments (counts by form_type) - coalesce downloaded_at with created_at fallback
        app_rows = conn.execute(
            text(
                """
                SELECT form_type, COUNT(*) AS cnt
                FROM appointment_log
                WHERE COALESCE(downloaded_at, created_at) >= :start 
                  AND COALESCE(downloaded_at, created_at) <= :end
                {user_filter}
                GROUP BY form_type
                """.format(user_filter=("AND user_id = :uid" if user_id is not None else ""))
            ),
            params,
        ).mappings().all()
        payload["appointments"] = [
            {"form_type": r.get("form_type"), "count": int(r.get("cnt") or 0)} for r in app_rows
        ]

    return payload
