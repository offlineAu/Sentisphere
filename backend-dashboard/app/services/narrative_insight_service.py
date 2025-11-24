from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session


class NarrativeInsightService:
    @staticmethod
    def behavior_highlights(
        db: Session,
        *,
        start_dt: Optional[datetime] = None,
        end_dt: Optional[datetime] = None,
        days: int = 30,
    ) -> List[Dict[str, Any]]:
        """Return simple per-day counts of check-ins for a recent window.

        Used to power lightweight narrative / behavior insights.
        """

        if start_dt is None or end_dt is None:
            end_dt = end_dt or datetime.utcnow()
            start_dt = end_dt - timedelta(days=days)

        # Inclusive start, exclusive end
        q = text(
            """
            SELECT DATE(created_at) AS day, COUNT(*) AS count
            FROM emotional_checkin
            WHERE created_at >= :start AND created_at < :end
            GROUP BY DATE(created_at)
            ORDER BY day ASC
            """
        )
        rows = db.execute(
            q,
            {
                "start": start_dt.strftime("%Y-%m-%d %H:%M:%S"),
                "end": end_dt.strftime("%Y-%m-%d %H:%M:%S"),
            },
        ).mappings()

        out: List[Dict[str, Any]] = []
        for r in rows:
            day = r["day"]
            if isinstance(day, datetime):
                day_str = day.date().isoformat()
            else:
                day_str = getattr(day, "isoformat", lambda: str(day))()
            out.append({"date": day_str, "count": int(r["count"] or 0)})
        return out

    @staticmethod
    def mood_shift_summary(
        db: Session,
        *,
        start_dt: Optional[datetime] = None,
        end_dt: Optional[datetime] = None,
        days: int = 30,
    ) -> Dict[str, Any]:
        """Summarize how check-in volume is shifting over a recent window.

        Returns a dict with a high-level "trend" label and a list of
        per-day "details" entries used by the AI sentiment summary endpoint.
        """

        details = NarrativeInsightService.behavior_highlights(
            db, start_dt=start_dt, end_dt=end_dt, days=days
        )

        if not details:
            return {"trend": "stable", "details": []}

        first = details[0]
        last = details[-1]
        first_count = int(first.get("count") or 0)
        last_count = int(last.get("count") or 0)

        if last_count > first_count:
            trend = "increasing"
        elif last_count < first_count:
            trend = "decreasing"
        else:
            trend = "stable"

        return {"trend": trend, "details": details}

