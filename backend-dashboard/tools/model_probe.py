from __future__ import annotations

"""
Developer tool: end-to-end probe for journal sentiment and insights.

Usage examples (from backend-dashboard/):

  # One-shot
  python tools/model_probe.py --user-id 1 --text "Kapoy kaayo ang adlaw pero nalipay ko sa akong friends."

  # Interactive (will prompt for text)
  python tools/model_probe.py --user-id 1

Behavior:
- Inserts a new journal row for the given user.
- Runs SentimentService to populate journal_sentiment.
- Builds a sanitized payload for the exact calendar day of this journal.
- Computes weekly and behavioral insights via InsightGenerationService.compute_and_store.
- Prints:
    * The created journal (id, user, created_at).
    * The latest JournalSentiment row for that journal.
    * A compact summary of weekly + behavioral insight data.

This is a DEV/QA-only tool and can be deleted or ignored in production.
"""

import argparse
from datetime import datetime, timedelta, date
from typing import Any, Dict, Optional
import sys
from pathlib import Path

from sqlalchemy import select

# Ensure project root (containing the 'app' package) is on sys.path
ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.db.session import SessionLocal
from app.models.journal import Journal
from app.models.journal_sentiment import JournalSentiment
from app.services.sentiment_service import SentimentService
from app.services.insight_generation_service import InsightGenerationService
from app.services.insight_data_service import build_sanitized_payload


def _print_header(title: str) -> None:
    print("\n" + "=" * 80)
    print(title)
    print("=" * 80)


def _pretty(obj: Dict[str, Any], keys: list[str]) -> Dict[str, Any]:
    return {k: obj.get(k) for k in keys if k in obj}


def run_probe(user_id: Optional[int], text: str) -> None:
    if not text.strip():
        raise SystemExit("Text is empty; nothing to analyze.")

    session = SessionLocal()
    try:
        now = datetime.utcnow()
        j = Journal(user_id=user_id, content=text, created_at=now)
        session.add(j)
        session.commit()
        session.refresh(j)

        _print_header("Journal created")
        print({
            "journal_id": j.journal_id,
            "user_id": j.user_id,
            "created_at": j.created_at.isoformat() if isinstance(j.created_at, datetime) else str(j.created_at),
        })

        # Sentiment persistence
        SentimentService.remove_existing_journal_sentiments(session, j.journal_id)
        SentimentService.analyze_journal(session, j.journal_id)
        session.commit()

        stmt = (
            select(JournalSentiment)
            .where(JournalSentiment.journal_id == j.journal_id)
            .order_by(JournalSentiment.analyzed_at.desc())
        )
        js = session.scalars(stmt).first()

        _print_header("JournalSentiment row")
        if not js:
            print("No sentiment row found (unexpected).")
        else:
            print({
                "journal_sentiment_id": js.journal_sentiment_id,
                "journal_id": js.journal_id,
                "sentiment": js.sentiment,
                "emotions": js.emotions,
                "confidence": js.confidence,
                "model_version": js.model_version,
                "analyzed_at": js.analyzed_at.isoformat() if isinstance(js.analyzed_at, datetime) else str(js.analyzed_at),
            })

        # Timeframe: calendar day of this journal
        day: date = j.created_at.date() if isinstance(j.created_at, datetime) else date.today()
        start_dt = datetime.combine(day, datetime.min.time())
        end_dt = datetime.combine(day, datetime.max.time())

        payload = build_sanitized_payload(user_id, start_dt, end_dt)

        # Weekly insight (single-week window)
        weekly_data, _ = InsightGenerationService.compute_and_store(
            db=session,
            user_id=user_id,
            timeframe_start=day,
            timeframe_end=day,
            payload=payload,
            insight_type="weekly",
        )

        _print_header("Weekly insight (single-day window)")
        print(_pretty(weekly_data, [
            "title",
            "summary",
            "dominant_emotions",
            "top_concerns",
            "journal_themes",
            "mood_trends",
        ]))

        # Behavioral insight (same window)
        behavioral_data, _ = InsightGenerationService.compute_and_store(
            db=session,
            user_id=user_id,
            timeframe_start=day,
            timeframe_end=day,
            payload=payload,
            insight_type="behavioral",
        )

        _print_header("Behavioral insight (single-day window)")
        print(_pretty(behavioral_data, [
            "recurring_emotional_patterns",
            "irregular_changes",
            "risk_flags",
            "behavioral_clusters",
            "themes",
        ]))

        print("\nDone. You can inspect the `journal`, `journal_sentiment`, and `ai_insights` tables for persisted data.")
    finally:
        session.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Probe journal sentiment and insights for a single text entry.")
    parser.add_argument("--user-id", type=int, default=None, help="User id to attribute the journal to (optional).")
    parser.add_argument("--text", type=str, default=None, help="Journal text to analyze. If omitted, read from stdin.")
    args = parser.parse_args()

    if args.text is None:
        print("Enter journal text. Finish with Ctrl+D (Unix) or Ctrl+Z then Enter (Windows):")
        try:
            raw = []
            while True:
                line = input()
                raw.append(line)
        except EOFError:
            pass
        text = "\n".join(raw)
    else:
        text = args.text

    run_probe(args.user_id, text)


if __name__ == "__main__":
    main()
