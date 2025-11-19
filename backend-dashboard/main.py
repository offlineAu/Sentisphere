from fastapi import FastAPI, Query, HTTPException, Depends, status, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import case, func, select, text
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, date
import os
from pathlib import Path
import json
from collections import Counter
import re
import typing
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import csv
import logging
from fastapi.security import OAuth2PasswordBearer

from app.core.config import settings
from app.db.database import engine, ENGINE_INIT_ERROR_MSG
from app.db.mobile_database import mobile_engine
from app.db.session import get_db
from app.api.routes.auth import router as auth_router
from app.models.alert import Alert, AlertSeverity, AlertStatus
from app.models.appointment_log import AppointmentLog
from app.models.checkin_sentiment import CheckinSentiment
from app.models.conversations import Conversation, ConversationStatus
from app.models.emotional_checkin import EmotionalCheckin, EnergyLevel, MoodLevel, StressLevel
from app.models.journal import Journal
from app.models.journal_sentiment import JournalSentiment
from app.models.messages import Message
from app.schemas.alert import Alert as AlertSchema, AlertCreate, AlertUpdate
from app.schemas.checkin import (
    EmotionalCheckin as EmotionalCheckinSchema,
    EmotionalCheckinCreate,
    EmotionalCheckinUpdate,
)
from app.schemas.conversation import (
    Conversation as ConversationSchema,
    ConversationCreate,
    ConversationStart,
    ConversationUpdate,
    Message as MessageSchema,
    MessageCreate,
    MessageSend,
)
from app.schemas.journal import (
    Journal as JournalSchema,
    JournalCreate,
    JournalUpdate,
)
from app.models.notification import Notification
from app.models.user import User, UserRole
from app.models.user_activity import UserActivity
from app.services.alert_service import AlertService
from app.services.checkin_service import CheckinService
from app.services.conversation_service import ConversationService
from app.services.journal_service import JournalService
from app.services.jwt import decode_token
from app.services.narrative_insight_service import NarrativeInsightService
from app.services.report_service import ReportService

BASE_DIR = Path(__file__).resolve().parent
EVENTS_FILE = BASE_DIR / "events.json"

app = FastAPI(title=settings.APP_NAME)

logging.basicConfig(level=logging.INFO)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Optional auth router (not enforced on other routes)
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")

def _extract_user_id(token: str) -> int:
    try:
        payload = decode_token(token)
        sub = payload.get("sub")
        if not sub:
            raise ValueError("Invalid token payload")
        return int(sub)
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    user_id = _extract_user_id(token)
    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User inactive or missing")
    return user


def require_counselor(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.COUNSELOR:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Counselor access required")
    return current_user


def require_student(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.STUDENT:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Student access required")
    return current_user


# --- Mobile ingestion: Emotional check-ins ---


@app.get("/api/checkins", response_model=List[EmotionalCheckinSchema])
def list_my_checkins(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    return CheckinService.list_checkins(db, user_id=current_user.user_id, skip=skip, limit=limit)


@app.post("/api/checkins", response_model=EmotionalCheckinSchema, status_code=status.HTTP_201_CREATED)
def create_checkin(
    checkin_in: EmotionalCheckinCreate,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    payload = checkin_in
    if checkin_in.user_id is None or checkin_in.user_id != current_user.user_id:
        payload = EmotionalCheckinCreate(
            **checkin_in.model_dump(exclude_unset=True),
            user_id=current_user.user_id,
        )
    created = CheckinService.create_checkin(db, payload)
    return created


@app.get("/api/checkins/{checkin_id}", response_model=EmotionalCheckinSchema)
def get_checkin(
    checkin_id: int,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    checkin = CheckinService.get_checkin(db, checkin_id)
    if not checkin or checkin.user_id != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Check-in not found")
    return checkin


@app.patch("/api/checkins/{checkin_id}", response_model=EmotionalCheckinSchema)
def update_checkin(
    checkin_id: int,
    checkin_in: EmotionalCheckinUpdate,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    checkin = CheckinService.get_checkin(db, checkin_id)
    if not checkin or checkin.user_id != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Check-in not found")
    updated = CheckinService.update_checkin(db, checkin, checkin_in)
    return updated


@app.delete("/api/checkins/{checkin_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_checkin(
    checkin_id: int,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    checkin = CheckinService.get_checkin(db, checkin_id)
    if not checkin or checkin.user_id != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Check-in not found")
    CheckinService.delete_checkin(db, checkin)
    return None


# --- Mobile ingestion: Journals ---


@app.get("/api/journals-service", response_model=List[JournalSchema])
def list_my_journals(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    return JournalService.list_journals(db, user_id=current_user.user_id, skip=skip, limit=limit)


@app.post("/api/journals-service", response_model=JournalSchema, status_code=status.HTTP_201_CREATED)
def create_journal(
    journal_in: JournalCreate,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    payload = journal_in
    if journal_in.user_id is None or journal_in.user_id != current_user.user_id:
        payload = JournalCreate(
            **journal_in.model_dump(exclude_unset=True),
            user_id=current_user.user_id,
        )
    created = JournalService.create_journal(db, payload)
    return created


@app.get("/api/journals-service/{journal_id}", response_model=JournalSchema)
def get_journal(
    journal_id: int,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    journal = JournalService.get_journal(db, journal_id)
    if not journal or journal.user_id != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Journal not found")
    return journal


@app.patch("/api/journals-service/{journal_id}", response_model=JournalSchema)
def update_journal(
    journal_id: int,
    journal_in: JournalUpdate,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    journal = JournalService.get_journal(db, journal_id)
    if not journal or journal.user_id != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Journal not found")
    updated = JournalService.update_journal(db, journal, journal_in)
    return updated


@app.delete("/api/journals-service/{journal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_journal(
    journal_id: int,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    journal = JournalService.get_journal(db, journal_id)
    if not journal or journal.user_id != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Journal not found")
    JournalService.delete_journal(db, journal)
    return None


# --- Mobile ingestion: Alerts ---


@app.post("/alerts", response_model=AlertSchema, status_code=status.HTTP_201_CREATED)
def create_alert(
    alert_in: AlertCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    payload_data = alert_in.model_dump(exclude_unset=True)
    if current_user.role == UserRole.STUDENT:
        if alert_in.user_id and alert_in.user_id != current_user.user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot report for another user")
        payload_data["user_id"] = current_user.user_id
    alert = AlertService.create_alert(db, AlertCreate(**payload_data))
    return alert
@app.get("/api/auth/me")
def auth_me(token: str = Depends(oauth2_scheme)):
    """Return the current authenticated user id from JWT (subject)."""
    try:
        payload = decode_token(token)
        sub = payload.get("sub")
        if not sub:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        return {"user_id": int(sub)}
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

@app.get("/api/mood-trend")
def mood_trend(
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    query = text(
        """
        SELECT
            YEAR(created_at) AS year,
            MONTH(created_at) AS month_num,
            MONTHNAME(created_at) AS month_name,
            WEEK(created_at, 3) - WEEK(DATE_SUB(created_at, INTERVAL DAYOFMONTH(created_at)-1 DAY), 3) + 1 AS week_in_month,
            ROUND(AVG(
                CASE mood_level
                    WHEN 'Very Sad' THEN 1
                    WHEN 'Sad' THEN 2
                    WHEN 'Neutral' THEN 3
                    WHEN 'Good' THEN 4
                    WHEN 'Happy' THEN 5
                    WHEN 'Very Happy' THEN 6
                    WHEN 'Excellent' THEN 7
                    ELSE NULL
                END
            ), 2) AS avgMood
        FROM emotional_checkin
        GROUP BY year, month_num, month_name, week_in_month
        ORDER BY year, month_num, week_in_month
        """
    )
    rows = db.execute(query).mappings()
    return [
        {
            "week": f"{row['year']}-{row['month_name']}-Week{row['week_in_month']}",
            "avgMood": float(row["avgMood"] or 0),
        }
        for row in rows
    ]


@app.get("/alerts")
def list_alerts(
    limit: int = Query(100, ge=1, le=1000),
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    alerts = CounselorReportService.list_alerts(db, limit=limit)
    return [
        {
            "severity": item["severity"],
            "created_at": item["created_at"].isoformat() if item["created_at"] else None,
        }
        for item in alerts
    ]


@app.get("/recent-alerts")
def recent_alerts(
    limit: int = Query(10, ge=1, le=100),
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    alerts = CounselorReportService.recent_alerts(db, limit=limit)
    return [
        {
            "id": item["id"],
            "name": item["name"],
            "severity": item["severity"],
            "status": item["status"],
            "created_at": item["created_at"].isoformat() if item["created_at"] else None,
        }
        for item in alerts
    ]


@app.get("/all-alerts")
def all_alerts(
    limit: int = Query(1000, ge=1, le=2000),
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    alerts = CounselorReportService.list_alerts(db, limit=limit)
    return [
        {
            "severity": item["severity"],
            "created_at": item["created_at"].isoformat() if item["created_at"] else None,
        }
        for item in alerts
    ]


@app.get("/students-monitored")
def students_monitored(
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    count = db.scalar(
        select(func.count(func.distinct(EmotionalCheckin.user_id))).join(User, EmotionalCheckin.user_id == User.user_id)
        .where(User.role == UserRole.STUDENT, User.is_active.is_(True))
    ) or 0
    return {"count": int(count)}


@app.get("/this-week-checkins")
def this_week_checkins(
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    start, end = CounselorReportService._week_bounds(datetime.utcnow().date())
    count = db.scalar(
        select(func.count(EmotionalCheckin.checkin_id)).where(
            EmotionalCheckin.created_at >= start, EmotionalCheckin.created_at <= end
        )
    ) or 0
    return {"count": int(count)}


@app.get("/open-appointments")
def open_appointments(
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    cutoff = datetime.utcnow() - timedelta(days=7)
    count = db.scalar(
        select(func.count(func.distinct(UserActivity.user_id))).where(
            UserActivity.action == "downloaded_form",
            UserActivity.target_type == "form",
            UserActivity.created_at >= cutoff,
        )
    ) or 0
    return {"count": int(count)}


@app.get("/high-risk-flags")
def high_risk_flags(
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    cutoff = datetime.utcnow() - timedelta(days=7)
    alert_count = db.scalar(
        select(func.count(Alert.alert_id)).where(
            Alert.severity.in_([AlertSeverity.HIGH, AlertSeverity.CRITICAL]),
            Alert.status.in_([AlertStatus.OPEN, AlertStatus.IN_PROGRESS]),
        )
    ) or 0
    journal_count = db.scalar(
        select(func.count(JournalSentiment.journal_id)).where(
            JournalSentiment.sentiment == "negative",
            JournalSentiment.analyzed_at >= cutoff,
        )
    ) or 0
    checkin_count = db.scalar(
        select(func.count(CheckinSentiment.checkin_id)).where(
            CheckinSentiment.sentiment == "negative",
            CheckinSentiment.analyzed_at >= cutoff,
        )
    ) or 0
    return {"count": int(alert_count + journal_count + checkin_count)}


@app.get("/sentiments")
def sentiment_breakdown(
    period: str = Query("month", enum=["week", "month", "year"]),
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    if period == "week":
        condition = "YEARWEEK(analyzed_at, 1) = YEARWEEK(CURDATE(), 1)"
    elif period == "month":
        condition = "YEAR(analyzed_at) = YEAR(CURDATE()) AND MONTH(analyzed_at) = MONTH(CURDATE())"
    elif period == "year":
        condition = "YEAR(analyzed_at) = YEAR(CURDATE())"
    else:
        condition = "TRUE"

    query = text(
        f"""
        SELECT sentiment, COUNT(*) AS value FROM (
            SELECT sentiment, analyzed_at FROM checkin_sentiment
            UNION ALL
            SELECT sentiment, analyzed_at FROM journal_sentiment
        ) AS combined
        WHERE {condition}
        GROUP BY sentiment
        """
    )
    rows = db.execute(query).mappings()
    return [{"name": row["sentiment"], "value": row["value"]} for row in rows]


@app.get("/checkin-breakdown")
def checkin_breakdown(
    period: str = Query("month", enum=["week", "month", "year"]),
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    if period == "week":
        condition = "YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1)"
    elif period == "month":
        condition = "YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE())"
    elif period == "year":
        condition = "YEAR(created_at) = YEAR(CURDATE())"
    else:
        condition = "TRUE"

    q_mood = text(f"""
        SELECT mood_level AS label, COUNT(*) AS value
        FROM emotional_checkin
        WHERE {condition}
        GROUP BY mood_level
    """)
    q_energy = text(f"""
        SELECT energy_level AS label, COUNT(*) AS value
        FROM emotional_checkin
        WHERE {condition}
        GROUP BY energy_level
    """)
    q_stress = text(f"""
        SELECT stress_level AS label, COUNT(*) AS value
        FROM emotional_checkin
        WHERE {condition}
        GROUP BY stress_level
    """)

    mood_rows = db.execute(q_mood).mappings()
    energy_rows = db.execute(q_energy).mappings()
    stress_rows = db.execute(q_stress).mappings()
    return {
        "mood": [{"label": r["label"], "value": r["value"]} for r in mood_rows],
        "energy": [{"label": r["label"], "value": r["value"]} for r in energy_rows],
        "stress": [{"label": r["label"], "value": r["value"]} for r in stress_rows],
    }

class CheckinIn(BaseModel):
    mood_level: str
    energy_level: str
    stress_level: str
    comment: Optional[str] = None

@app.post("/api/emotional-checkins")
def create_emotional_checkin(payload: CheckinIn, token: str = Depends(oauth2_scheme)):
    try:
        data = decode_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    # For mobile: subject is the Mobile DB user_id
    try:
        uid = int(data.get("sub"))
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token subject")

    # Normalize stress label to match schema
    stress = payload.stress_level
    if stress == "Very High":
        stress = "Very High Stress"

    # Insert into the MOBILE database
    with mobile_engine.connect() as conn:
        try:
            ins = conn.execute(text(
                """
                INSERT INTO emotional_checkin (user_id, mood_level, energy_level, stress_level, comment, created_at)
                VALUES (:uid, :mood, :energy, :stress, :comment, NOW())
                """
            ), {
                "uid": uid,
                "mood": payload.mood_level,
                "energy": payload.energy_level,
                "stress": stress,
                "comment": (payload.comment or None),
            })
            conn.commit()
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to save check-in: {exc.__class__.__name__}")

    return {"ok": True, "checkin_id": int(ins.lastrowid)}


class JournalIn(BaseModel):
    content: str


@app.post("/api/journals")
def create_journal(payload: JournalIn, token: str = Depends(oauth2_scheme)):
    try:
        data = decode_token(token)
        uid = int(data.get("sub"))
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    content = (payload.content or "").strip()
    if not content:
        raise HTTPException(status_code=422, detail="Content required")

    with mobile_engine.connect() as conn:
        try:
            ins = conn.execute(
                text(
                    """
                    INSERT INTO journal (user_id, content, created_at)
                    VALUES (:uid, :content, NOW())
                    """
                ),
                {"uid": uid, "content": content},
            )
            conn.commit()
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to save journal: {exc.__class__.__name__}")

    return {"ok": True, "journal_id": int(ins.lastrowid)}

@app.get("/api/journals")
def list_journals(limit: int = Query(50, ge=1, le=200), token: str = Depends(oauth2_scheme)):
    try:
        data = decode_token(token)
        uid = int(data.get("sub"))
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    q = text(
        """
        SELECT journal_id, content, created_at
        FROM journal
        WHERE user_id = :uid AND (deleted_at IS NULL)
        ORDER BY created_at DESC
        LIMIT :lim
        """
    )
    with mobile_engine.connect() as conn:
        rows = conn.execute(q, {"uid": uid, "lim": limit}).mappings()
        return [
            {
                "journal_id": r["journal_id"],
                "content": r["content"],
                "created_at": r["created_at"].strftime("%Y-%m-%dT%H:%M:%S") if r["created_at"] else None,
            }
            for r in rows
        ]

@app.get("/api/journals/{journal_id}")
def get_journal(journal_id: int, token: str = Depends(oauth2_scheme)):
    try:
        data = decode_token(token)
        uid = int(data.get("sub"))
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    q = text(
        """
        SELECT journal_id, content, created_at
        FROM journal
        WHERE journal_id = :jid AND user_id = :uid AND (deleted_at IS NULL)
        LIMIT 1
        """
    )
    with mobile_engine.connect() as conn:
        row = conn.execute(q, {"jid": journal_id, "uid": uid}).mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Journal not found")
        return {
            "journal_id": row["journal_id"],
            "content": row["content"],
            "created_at": row["created_at"].strftime("%Y-%m-%dT%H:%M:%S") if row["created_at"] else None,
        }

@app.get("/reports/top-stats")
def get_top_stats(
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    return CounselorReportService.top_stats(db)


@app.get("/reports/summary")
def reports_summary(
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    return CounselorReportService.summary(db)


@app.get("/reports/trends")
def reports_trends(
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    data = CounselorReportService.trends(db)
    return {
        **data,
        "dates": data["dates"],
        "mood": data["mood"],
        "energy": data["energy"],
        "stress": data["stress"],
        "wellness_index": data["wellness_index"],
        "current_index": data["current_index"],
        "previous_index": data["previous_index"],
        "change_percent": data["change_percent"],
        "numerical_change": data["numerical_change"],
    }


@app.get("/reports/engagement")
def reports_engagement(
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    return CounselorReportService.engagement_metrics(db)


@app.get("/reports/weekly-insights")
def weekly_insights(
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    return CounselorReportService.weekly_insights(db)


@app.get("/reports/behavior-insights")
def behavior_insights(
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    return CounselorReportService.behavior_insights(db)


@app.get("/reports/attention")
def get_attention_students(
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    return CounselorReportService.attention_students(db)


@app.get("/reports/concerns")
def get_concerns(
    period: str = Query("month", enum=["week", "month"]),
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    now = datetime.utcnow()
    if period == "week":
        start = now - timedelta(days=7)
    else:
        start = now.replace(day=1)
    return CounselorReportService.concerns(db, start=start)


@app.get("/reports/interventions")
def get_interventions(
    period: str = Query("month", enum=["week", "month"]),
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    now = datetime.utcnow()
    if period == "week":
        start = now - timedelta(days=7)
    else:
        start = now.replace(day=1)
    return CounselorReportService.interventions(db, start=start)


@app.get("/reports/participation")
def get_participation(
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    return CounselorReportService.participation(db)


@app.get("/analytics/intervention-success")
def intervention_success(
    _user: User = Depends(require_counselor),
    db: Session = Depends(get_db),
):
    return CounselorReportService.intervention_success(db)


@app.get("/events")
def list_events(
    _user: User = Depends(require_counselor),
):
    return CounselorReportService.load_academic_events()


@app.post("/calendar/upload")
async def upload_calendar(
    file: UploadFile,
    _user: User = Depends(require_counselor),
):
    content = await file.read()

    def _extract_events_from_file(filename: str, content: bytes) -> List[Dict[str, Any]]:
        name = filename.lower()
        if name.endswith(".csv"):
            try:
                text_data = content.decode("utf-8-sig")
                import csv

                reader = csv.DictReader(text_data.splitlines())
                parsed: List[Dict[str, Any]] = []
                for row in reader:
                    start_val = row.get("start") or row.get("start_date")
                    end_val = row.get("end") or row.get("end_date") or start_val
                    if not start_val or not end_val:
                        continue
                    parsed.append(
                        {
                            "name": row.get("name") or row.get("event") or "Unknown Event",
                            "type": row.get("type"),
                            "start_date": start_val,
                            "end_date": end_val,
                        }
                    )
                return parsed
            except Exception:
                return []
        return []

    new_events = _extract_events_from_file(file.filename, content)
    if not new_events:
        return {"status": "uploaded", "events_extracted": 0}

    try:
        with EVENTS_FILE.open("w", encoding="utf-8") as fh:
            json.dump(new_events, fh, indent=2)
    except Exception as exc:  # pragma: no cover - file IO failure
        raise HTTPException(status_code=500, detail="Failed to persist events") from exc

    return {"status": "uploaded", "events_extracted": len(new_events)}


# --- Conversations API (service-backed) ---


def _ensure_conversation_access(
    conversation: Optional[Conversation],
    current_user: User,
) -> Conversation:
    if conversation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    if current_user.role == UserRole.STUDENT and conversation.initiator_user_id != current_user.user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    return conversation


@app.get("/api/conversations", response_model=List[ConversationSchema])
def list_conversations(
    include_messages: bool = Query(False),
    initiator_user_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    filter_user_id: Optional[int] = None
    if current_user.role == UserRole.STUDENT:
        filter_user_id = current_user.user_id
    elif initiator_user_id is not None:
        filter_user_id = initiator_user_id

    return ConversationService.list_conversations(
        db,
        initiator_user_id=filter_user_id,
        include_messages=include_messages,
    )


@app.post("/api/conversations", response_model=ConversationSchema, status_code=status.HTTP_201_CREATED)
def start_conversation(
    conversation_in: ConversationStart,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    payload = ConversationCreate(
        initiator_user_id=current_user.user_id,
        initiator_role=current_user.role.value,
        subject=conversation_in.subject,
        status=ConversationStatus.OPEN,
    )
    return ConversationService.create_conversation(db, payload)


@app.get("/api/conversations/{conversation_id}", response_model=ConversationSchema)
def get_conversation(
    conversation_id: int,
    include_messages: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conversation = ConversationService.get_conversation(
        db,
        conversation_id,
        include_messages=include_messages,
    )
    return _ensure_conversation_access(conversation, current_user)


@app.patch("/api/conversations/{conversation_id}", response_model=ConversationSchema)
def update_conversation(
    conversation_id: int,
    conversation_in: ConversationUpdate,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    if conversation_in.last_activity_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="last_activity_at cannot be updated")
    conversation = _ensure_conversation_access(
        ConversationService.get_conversation(db, conversation_id),
        current_user,
    )
    updated = ConversationService.update_conversation(db, conversation, conversation_in)
    return updated


@app.get("/api/conversations/{conversation_id}/messages", response_model=List[MessageSchema])
def list_conversation_messages(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _ensure_conversation_access(
        ConversationService.get_conversation(db, conversation_id),
        current_user,
    )
    return ConversationService.list_messages(db, conversation_id)


@app.post(
    "/api/conversations/{conversation_id}/messages",
    response_model=MessageSchema,
    status_code=status.HTTP_201_CREATED,
)
def send_message(
    conversation_id: int,
    message_in: MessageSend,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conversation = _ensure_conversation_access(
        ConversationService.get_conversation(db, conversation_id),
        current_user,
    )
    message_payload = MessageCreate(
        sender_id=current_user.user_id,
        content=message_in.content,
        is_read=message_in.is_read,
    )
    return ConversationService.add_message(db, conversation, message_payload)


@app.post("/api/conversations/{conversation_id}/read")
def mark_conversation_read(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conversation = _ensure_conversation_access(
        ConversationService.get_conversation(db, conversation_id),
        current_user,
    )
    updated = ConversationService.mark_conversation_read(
        db,
        conversation.conversation_id,
        current_user.user_id,
    )
    return {"updated": updated}


# --- Analytics: Chat-based Intervention Success ---
def _simple_sentiment_scores(texts):
    """Return a list of polarity scores in [-1,1] using a tiny lexicon heuristic.
    This keeps the endpoint runnable without extra dependencies.
    """
    pos_words = {
        "good","great","improve","better","okay","fine","thanks","thank","happy","relieved","hopeful","resolved","helpful","appreciate","glad"
    }
    neg_words = {
        "bad","worse","sad","anxious","anxiety","stress","stressed","angry","upset","worried","depressed","terrible","awful","hopeless","stuck"
    }
    scores = []
    for t in texts or []:
        t_low = (t or "").lower()
        p = sum(1 for w in pos_words if w in t_low)
        n = sum(1 for w in neg_words if w in t_low)
        score = 0.0
        if p or n:
            score = (p - n) / max(p + n, 1)
        scores.append(max(-1.0, min(1.0, score)))
    return scores

def _avg(nums):
    nums = [float(x) for x in (nums or []) if x is not None]
    return (sum(nums) / len(nums)) if nums else 0.0

@app.get("/api/analytics/intervention-success")
def intervention_success():
    """Measure intervention success from chat only, by comparing early vs late
    student message sentiment within ended conversations.
    """
    q_convos = text(
        """
        SELECT c.conversation_id
        FROM conversations c
        WHERE c.status = 'ended'
        """
    )
    q_msgs = text(
        """
        SELECT m.content, m.timestamp, u.role
        FROM messages m
        JOIN user u ON m.sender_id = u.user_id
        WHERE m.conversation_id = :cid
        ORDER BY m.timestamp ASC
        """
    )

    total = 0
    success = 0
    total_duration_min = 0.0
    total_message_count = 0

    with engine.connect() as conn:
        convos = list(conn.execute(q_convos).mappings())
        for c in convos:
            cid = c["conversation_id"]
            rows = list(conn.execute(q_msgs, {"cid": cid}).mappings())
            if not rows:
                continue

            student_msgs = [r["content"] for r in rows if (r.get("role") or "").lower() == "student"]
            if len(student_msgs) < 2:
                continue

            total += 1

            # Early vs late sentiment (use up to 3 from start/end)
            start_slice = student_msgs[:3]
            end_slice = student_msgs[-3:]
            start_scores = _simple_sentiment_scores(start_slice)
            end_scores = _simple_sentiment_scores(end_slice)
            if _avg(end_scores) > _avg(start_scores):
                success += 1

            # Engagement metrics
            total_message_count += len(rows)
            try:
                first_ts = rows[0]["timestamp"]
                last_ts = rows[-1]["timestamp"]
                if first_ts and last_ts:
                    duration_min = (last_ts - first_ts).total_seconds() / 60.0
                    total_duration_min += max(0.0, duration_min)
            except Exception:
                pass

    success_rate = round((success / total * 100.0), 2) if total else 0.0
    avg_duration = round((total_duration_min / total), 1) if total else 0.0
    avg_messages = round((total_message_count / total), 1) if total else 0.0

    return {
        "overall_success_rate": success_rate,
        "total_sessions": total,
        "successful_sessions": success,
        "average_conversation_duration_minutes": avg_duration,
        "average_messages_per_conversation": avg_messages,
    }

# --- Messages per conversation ---
@app.get("/api/conversations/{conversation_id}/messages")
def get_messages(conversation_id: int, current_user: str = Depends(get_current_user)):
    query = """
        SELECT 
            m.message_id AS id,
            m.conversation_id,
            m.sender_id,
            u.name AS sender_name,
            u.role AS sender_role,
            m.content,
            m.is_read,
            m.timestamp
        FROM messages m
        JOIN user u ON m.sender_id = u.user_id
        WHERE m.conversation_id = :cid
        ORDER BY m.timestamp ASC
    """
    with engine.connect() as conn:
        result = conn.execute(text(query), {"cid": conversation_id}).mappings()
        return [dict(row) for row in result]


# --- Send message ---
class MessageIn(BaseModel):
    sender_id: int
    content: str

@app.post("/api/conversations/{conversation_id}/messages")
def send_message(conversation_id: int, message: MessageIn, current_user: str = Depends(get_current_user)):
    query = """
        INSERT INTO messages (conversation_id, sender_id, content, timestamp)
        VALUES (:cid, :sid, :content, NOW())
    """
    with engine.connect() as conn:
        result = conn.execute(
            text(query),
            {"cid": conversation_id, "sid": message.sender_id, "content": message.content}
        )
        conn.commit()

        return {
            "id": result.lastrowid,
            "conversation_id": conversation_id,
            "sender_id": message.sender_id,
            "content": message.content,
            "timestamp": str(datetime.now())
        }

@app.get("/health")
def health():
    status_map = {"web": "unknown", "mobile": "unknown"}

    def check_db(label: str, db_engine, init_error_msg: str | None = None):
        if init_error_msg:
            status_map[label] = f"error: {init_error_msg}"
            return False
        try:
            with db_engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            status_map[label] = "connected"
            return True
        except Exception as exc:
            status_map[label] = f"error: {exc.__class__.__name__}"
            return False

    web_ok = check_db("web", engine, ENGINE_INIT_ERROR_MSG)
    mobile_ok = check_db("mobile", mobile_engine)

    if web_ok and mobile_ok:
        return {"status": "ok", "databases": status_map}

    problem = []
    if not web_ok:
        problem.append("web_db unreachable")
    if not mobile_ok:
        problem.append("mobile_db unreachable")

    raise HTTPException(status_code=503, detail={"status": "unhealthy", "databases": status_map, "error": ", ".join(problem)})

# --- Mark messages as read in a conversation ---
@app.post("/api/conversations/{conversation_id}/read")
def mark_conversation_read(conversation_id: int, user_id: int = Query(...), current_user: str = Depends(get_current_user)):
    """
    Mark all messages in the conversation as read for the given user by setting is_read = 1
    for messages not sent by the user (i.e., incoming messages to the user).
    """
    update_q = text(
        """
        UPDATE messages
        SET is_read = 1
        WHERE conversation_id = :cid
          AND sender_id <> :uid
          AND (is_read = 0 OR is_read IS NULL)
        """
    )
    with engine.connect() as conn:
        result = conn.execute(update_q, {"cid": conversation_id, "uid": user_id})
        conn.commit()
        return {"updated": result.rowcount}
    
# --- Reports APIs ---

class WeeklyInsight(BaseModel):
    week_start: str
    week_end: str
    event_name: Optional[str] = None
    event_type: Optional[str] = None
    title: str
    description: str
    recommendation: str


class ReportSummary(BaseModel):
    week_start: str
    week_end: str
    current_wellness_index: int
    previous_wellness_index: int
    change: int
    event_name: Optional[str] = None
    event_type: Optional[str] = None
    insight: str
    insights: List[WeeklyInsight]


class TrendWeek(BaseModel):
    week_start: str
    week_end: str
    index: int
    avg_mood: float
    avg_energy: float
    avg_stress: float
    event_name: Optional[str] = None
    event_type: Optional[str] = None

class TrendsResponse(BaseModel):
    weeks: List[TrendWeek]

class EngagementMetrics(BaseModel):
    active_students_this_week: int
    active_students_last_week: int
    avg_checkins_per_student: float
    participation_change: str

def _week_bounds(today: date) -> tuple[datetime, datetime]:
    start = datetime.combine(today - timedelta(days=today.weekday()), datetime.min.time())
    end = start + timedelta(days=6, hours=23, minutes=59, seconds=59)
    return start, end

def _load_academic_events() -> list[dict]:
    try:
        events_path = Path(__file__).parent / "data" / "school_calendar.json"
        if events_path.exists():
            with open(events_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
    except Exception:
        pass
    return [
        {"name": "Midterm Exams", "type": "exam", "start_date": "2025-11-10", "end_date": "2025-11-16"},
        {"name": "Final Exams", "type": "exam", "start_date": "2025-12-08", "end_date": "2025-12-14"},
        {"name": "Enrollment Week", "type": "enrollment", "start_date": "2025-06-10", "end_date": "2025-06-16"},
        {"name": "Project Week", "type": "project", "start_date": "2025-10-20", "end_date": "2025-10-26"},
    ]

ACADEMIC_EVENTS = _load_academic_events()

def _parse_ymd(s: str) -> date:
    return datetime.strptime(s, "%Y-%m-%d").date()

def _event_for_range(start_d: date, end_d: date) -> tuple[Optional[str], Optional[str]]:
    for ev in ACADEMIC_EVENTS:
        try:
            ev_start = _parse_ymd(ev.get("start_date"))
            ev_end = _parse_ymd(ev.get("end_date"))
        except Exception:
            continue
        if ev_start <= end_d and ev_end >= start_d:
            return ev.get("name"), ev.get("type")
    return None, None

def _weekly_wellness_index(start_dt: datetime, end_dt: datetime) -> int:
    q = text(
        """
        SELECT ROUND(AVG(
            0.4 * (CASE mood_level
                WHEN 'Very Sad' THEN 0
                WHEN 'Sad' THEN 17
                WHEN 'Neutral' THEN 33
                WHEN 'Good' THEN 50
                WHEN 'Happy' THEN 67
                WHEN 'Very Happy' THEN 83
                WHEN 'Excellent' THEN 100
                ELSE NULL END)
          + 0.3 * (CASE energy_level
                WHEN 'Very Low' THEN 0
                WHEN 'Low' THEN 25
                WHEN 'Moderate' THEN 50
                WHEN 'High' THEN 75
                WHEN 'Very High' THEN 100
                ELSE NULL END)
          + 0.3 * (100 - (CASE stress_level
                WHEN 'No Stress' THEN 0
                WHEN 'Low Stress' THEN 25
                WHEN 'Moderate' THEN 50
                WHEN 'High Stress' THEN 75
                WHEN 'Very High Stress' THEN 100
                ELSE NULL END))
        ), 0) AS idx
        FROM emotional_checkin
        WHERE created_at >= :start AND created_at < :end
        """
    )
    with engine.connect() as conn:
        row = conn.execute(q, {
            "start": start_dt.strftime('%Y-%m-%d %H:%M:%S'),
            "end": (end_dt + timedelta(seconds=1)).strftime('%Y-%m-%d %H:%M:%S')
        }).mappings().first()
        val = row["idx"] if row else None
        try:
            return int(val or 0)
        except Exception:
            return 0


def _trend_detail(start_dt: datetime, end_dt: datetime) -> Dict[str, float]:
    query = text(
        """
        SELECT
            AVG(CASE mood_level
                WHEN 'Very Sad' THEN 1
                WHEN 'Sad' THEN 2
                WHEN 'Neutral' THEN 3
                WHEN 'Good' THEN 4
                WHEN 'Happy' THEN 5
                WHEN 'Very Happy' THEN 6
                WHEN 'Excellent' THEN 7
                ELSE NULL END) AS avg_mood,
            AVG(CASE energy_level
                WHEN 'Very Low' THEN 1
                WHEN 'Low' THEN 2
                WHEN 'Moderate' THEN 3
                WHEN 'High' THEN 4
                WHEN 'Very High' THEN 5
                ELSE NULL END) AS avg_energy,
            AVG(CASE stress_level
                WHEN 'No Stress' THEN 1
                WHEN 'Low Stress' THEN 2
                WHEN 'Moderate' THEN 3
                WHEN 'High Stress' THEN 4
                WHEN 'Very High Stress' THEN 5
                ELSE NULL END) AS avg_stress
        FROM emotional_checkin
        WHERE created_at >= :start AND created_at < :end
        """
    )
    end_exclusive = end_dt + timedelta(seconds=1)
    with engine.connect() as conn:
        row = conn.execute(query, {
            "start": start_dt.strftime('%Y-%m-%d %H:%M:%S'),
            "end": end_exclusive.strftime('%Y-%m-%d %H:%M:%S'),
        }).mappings().first()
        if not row:
            return {"avg_mood": 0.0, "avg_energy": 0.0, "avg_stress": 0.0}
        mood_raw = row["avg_mood"]
        energy_raw = row["avg_energy"]
        stress_raw = row["avg_stress"]

        def _scale(val: Optional[float], min_val: float, max_val: float) -> float:
            if val is None:
                return 0.0
            return round(((float(val) - min_val) / (max_val - min_val)) * 100, 1)

        return {
            "avg_mood": _scale(mood_raw, 1, 7),
            "avg_energy": _scale(energy_raw, 1, 5),
            "avg_stress": _scale(stress_raw, 1, 5),
        }


def _journal_themes(start_dt: datetime, end_dt: datetime, limit: int = 3) -> List[str]:
    q = text(
        """
        SELECT sentiment
        FROM journal_sentiment js
        JOIN journal j ON j.journal_id = js.journal_id
        WHERE j.created_at >= :start AND j.created_at < :end
        ORDER BY j.created_at DESC
        LIMIT 200
        """
    )
    with engine.connect() as conn:
        sentiments = [row["sentiment"] for row in conn.execute(q, {
            "start": start_dt.strftime('%Y-%m-%d %H:%M:%S'),
            "end": end_dt.strftime('%Y-%m-%d %H:%M:%S'),
        }).mappings()]
    counts = Counter(sentiments)
    return [name for name, _ in counts.most_common(limit)]


def _build_recommendation(change: int, themes: List[str]) -> str:
    if change >= 5:
        base = "Momentum is positive. Continue reinforcing healthy routines."
    elif change <= -5:
        base = "Consider proactive outreach—students may need extra support this week."
    else:
        base = "Wellness is stable. Maintain regular check-ins."
    if themes:
        theme_notes = ", ".join(themes[:2])
        return f"{base} Watch for recurring sentiments: {theme_notes}."
    return base


def _load_events() -> List[Dict[str, Any]]:
    if not EVENTS_FILE.exists():
        return []
    try:
        with EVENTS_FILE.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
            return data if isinstance(data, list) else []
    except Exception:
        return []


def _event_overlaps(event: Dict[str, Any], start: date, end: date) -> bool:
    try:
        ev_start = datetime.strptime(event["start"], "%Y-%m-%d").date()
        ev_end = datetime.strptime(event["end"], "%Y-%m-%d").date()
    except Exception:
        return False
    return ev_start <= end and ev_end >= start


def _extract_events_from_file(filename: str, content: bytes) -> List[Dict[str, Any]]:
    name = filename.lower()
    if name.endswith(".csv"):
        try:
            text_data = content.decode("utf-8-sig")
            reader = csv.DictReader(text_data.splitlines())
            events = []
            for row in reader:
                events.append({
                    "name": row.get("name") or row.get("event") or "Unknown Event",
                    "start": row.get("start") or row.get("start_date"),
                    "end": row.get("end") or row.get("end_date"),
                    "type": row.get("type")
                })
            return [ev for ev in events if ev.get("start") and ev.get("end")]
        except Exception:
            return []
    # Other formats would require OCR or structured parsing; return empty for now.
    return []
@app.get("/api/reports/summary", response_model=ReportSummary)
def reports_summary(current_user: str = Depends(get_current_user)):
    today = datetime.now().date()
    start_dt, end_dt = _week_bounds(today)

    insight_weeks = 4
    offsets = list(range(insight_weeks - 1, -1, -1))
    insight_records: List[Dict[str, typing.Any]] = []
    previous_index: Optional[int] = None
    last_index: Optional[int] = None

    for offset in offsets:
        week_start_dt = start_dt - timedelta(weeks=offset)
        week_end_dt = week_start_dt + timedelta(days=6, hours=23, minutes=59, seconds=59)
        index_val = _weekly_wellness_index(week_start_dt, week_end_dt)
        change = 0 if last_index is None else index_val - last_index
        last_index = index_val

        ev_name, ev_type = _event_for_range(week_start_dt.date(), week_end_dt.date())
        themes = _journal_themes(week_start_dt, week_end_dt)
        recommendation = _build_recommendation(change, themes)

        if change > 5:
            title = "Wellness Surge"
            direction = f"rose by {change} points"
        elif change < -5:
            title = "Wellness Dip"
            direction = f"fell by {abs(change)} points"
        elif change > 0:
            title = "Positive Momentum"
            direction = f"rose by {change} point{'' if change == 1 else 's'}"
        elif change < 0:
            title = "Downward Shift"
            direction = f"fell by {abs(change)} point{'' if change == -1 else 's'}"
        else:
            title = "Stable Wellness"
            direction = "held steady"

        description = f"Wellness index {direction} to {index_val}."
        if ev_name:
            description += f" During {ev_name.lower()}, watch for stress triggers."

        insight_obj = WeeklyInsight(
            week_start=week_start_dt.strftime('%Y-%m-%d'),
            week_end=(week_start_dt + timedelta(days=6)).strftime('%Y-%m-%d'),
            event_name=ev_name,
            event_type=ev_type,
            title=title,
            description=description,
            recommendation=recommendation,
        )

        insight_records.append({
            "insight": insight_obj,
            "change": change,
            "index": index_val,
        })

    insight_records = list(reversed(insight_records))  # most recent first
    insights = [record["insight"] for record in insight_records]

    current_record = insight_records[0]
    previous_record = insight_records[1] if len(insight_records) > 1 else insight_records[0]

    return ReportSummary(
        week_start=current_record["insight"].week_start,
        week_end=current_record["insight"].week_end,
        current_wellness_index=current_record["index"],
        previous_wellness_index=previous_record["index"],
        change=current_record["index"] - previous_record["index"],
        event_name=current_record["insight"].event_name,
        event_type=current_record["insight"].event_type,
        insight=current_record["insight"].description,
        insights=insights,
    )

def _collect_weekly_trends(weeks: int = 12) -> List[Dict[str, Any]]:
    today = datetime.now().date()
    this_start, _ = _week_bounds(today)
    base_monday = this_start.date()
    items: List[Dict[str, Any]] = []
    for i in range(weeks - 1, -1, -1):
        wk_start_date = base_monday - timedelta(weeks=i)
        wk_end_date = wk_start_date + timedelta(days=6)
        start_dt = datetime.combine(wk_start_date, datetime.min.time())
        end_dt = datetime.combine(wk_end_date, datetime.max.time())
        idx = _weekly_wellness_index(start_dt, end_dt)
        metrics = _trend_detail(start_dt, end_dt)
        items.append({
            "week_start": wk_start_date,
            "week_end": wk_end_date,
            "index": idx,
            "avg_mood": metrics["avg_mood"],
            "avg_energy": metrics["avg_energy"],
            "avg_stress": metrics["avg_stress"],
        })
    return items


@app.get("/api/reports/trends")
def reports_trends(current_user: str = Depends(get_current_user)):
    data = _collect_weekly_trends()
    dates = [item["week_start"].strftime('%Y-%m-%d') for item in data]
    mood = [item["avg_mood"] for item in data]
    energy = [item["avg_energy"] for item in data]
    stress = [item["avg_stress"] for item in data]
    wellness = [item["index"] for item in data]

    current_index = wellness[-1] if wellness else 0
    previous_index = wellness[-2] if len(wellness) > 1 else current_index
    change_percent = 0
    if previous_index:
        change_percent = round(((current_index - previous_index) / max(previous_index, 1e-9)) * 100)
    numerical_change = current_index - previous_index

    return {
        "dates": dates,
        "mood": mood,
        "energy": energy,
        "stress": stress,
        "wellness_index": wellness,
        "current_index": current_index,
        "previous_index": previous_index,
        "change_percent": change_percent,
        "numerical_change": numerical_change,
    }

@app.get("/api/reports/engagement", response_model=EngagementMetrics)
def reports_engagement(current_user: str = Depends(get_current_user)):
    today = datetime.now().date()
    this_start_dt, this_end_dt = _week_bounds(today)
    last_start_dt = this_start_dt - timedelta(days=7)
    last_end_dt = this_end_dt - timedelta(days=7)

    q_counts = text(
        """
        SELECT 
          COUNT(DISTINCT user_id) AS active,
          COUNT(*) AS total
        FROM emotional_checkin
        WHERE created_at >= :start AND created_at < :end
        """
    )
    q_total_students = text("SELECT COUNT(*) AS total FROM user WHERE role = 'student'")

    with engine.connect() as conn:
        this_rows = conn.execute(q_counts, {
            "start": this_start_dt.strftime('%Y-%m-%d %H:%M:%S'),
            "end": (this_end_dt + timedelta(seconds=1)).strftime('%Y-%m-%d %H:%M:%S')
        }).mappings().first()
        last_rows = conn.execute(q_counts, {
            "start": last_start_dt.strftime('%Y-%m-%d %H:%M:%S'),
            "end": (last_end_dt + timedelta(seconds=1)).strftime('%Y-%m-%d %H:%M:%S')
        }).mappings().first()
        total_students = conn.execute(q_total_students).mappings().first()["total"]

    active_this = int(this_rows["active"] or 0)
    total_this = int(this_rows["total"] or 0)
    active_last = int(last_rows["active"] or 0)
    total_last = int(last_rows["total"] or 0)

    avg_this = round((total_this / active_this), 1) if active_this > 0 else 0.0
    part_this = (active_this / total_students) if total_students else 0.0
    part_last = (active_last / total_students) if total_students else 0.0
    if part_last > 0:
        change_pct = round(((part_this - part_last) * 100) / max(part_last, 1e-9))
        sign = "+" if change_pct >= 0 else ""
        part_change = f"{sign}{change_pct}%"
    else:
        part_change = "0%"

    return EngagementMetrics(
        active_students_this_week=active_this,
        active_students_last_week=active_last,
        avg_checkins_per_student=avg_this,
        participation_change=part_change,
    )

@app.get("/api/reports/weekly-insights")
def weekly_insights(current_user: str = Depends(get_current_user)):
    trends = _collect_weekly_trends(6)
    insights: List[Dict[str, Any]] = []
    events = _load_events()

    for idx, item in enumerate(trends):
        prev_idx = trends[idx - 1]["index"] if idx > 0 else item["index"]
        change = item["index"] - prev_idx
        change_abs = abs(change)
        start_label = item["week_start"].strftime('%Y-%m-%d')
        end_label = item["week_end"].strftime('%Y-%m-%d')

        title = "Stable Wellness"
        if change > 5:
            title = "Wellness Surge"
        elif change < -5:
            title = "Wellness Dip"

        description = f"Wellness index {('rose' if change >=0 else 'fell')} by {change_abs} points to {item['index']}."
        recommendation = _build_recommendation(change, _journal_themes(
            datetime.combine(item["week_start"], datetime.min.time()),
            datetime.combine(item["week_end"], datetime.max.time()),
        ))

        matched_event = next((ev for ev in events if _event_overlaps(ev, item["week_start"], item["week_end"])) , None)

        insights.append({
            "week_start": start_label,
            "week_end": end_label,
            "event_name": matched_event["name"] if matched_event else None,
            "event_type": matched_event.get("type") if matched_event else None,
            "title": title,
            "description": description,
            "recommendation": recommendation,
        })

    return insights


@app.get("/api/reports/behavior-insights")
def behavior_insights(current_user: str = Depends(get_current_user)):
    today = datetime.now().date()
    this_start, this_end = _week_bounds(today)
    last_start = this_start - timedelta(days=7)
    last_end = this_end - timedelta(days=7)

    def _stress_cases(start_dt: datetime, end_dt: datetime) -> int:
        q = text(
            """
            SELECT COUNT(*) FROM emotional_checkin
            WHERE created_at >= :start AND created_at < :end
              AND stress_level IN ('High Stress', 'Very High Stress')
            """
        )
        with engine.connect() as conn:
            return conn.execute(q, {
                "start": start_dt.strftime('%Y-%m-%d %H:%M:%S'),
                "end": (end_dt + timedelta(seconds=1)).strftime('%Y-%m-%d %H:%M:%S')
            }).scalar() or 0

    this_stress = _stress_cases(this_start, this_end)
    last_stress = _stress_cases(last_start, last_end)

    journaling_q = text(
        """
        SELECT COUNT(*) FROM journal
        WHERE created_at >= :start AND created_at < :end
        """
    )
    with engine.connect() as conn:
        journals_this = conn.execute(journaling_q, {
            "start": this_start.strftime('%Y-%m-%d %H:%M:%S'),
            "end": (this_end + timedelta(seconds=1)).strftime('%Y-%m-%d %H:%M:%S')
        }).scalar() or 0
        journals_last = conn.execute(journaling_q, {
            "start": last_start.strftime('%Y-%m-%d %H:%M:%S'),
            "end": (last_end + timedelta(seconds=1)).strftime('%Y-%m-%d %H:%M:%S')
        }).scalar() or 0

    stress_change = this_stress - last_stress
    stress_change_pct = round(((this_stress - last_stress) / max(last_stress, 1e-9)) * 100) if last_stress else 0

    return [
        {
            "title": "Stress Spike Patterns",
            "description": "Weekly comparison of high-stress check-ins shows how acute events affect students.",
            "metrics": [
                {"label": "High stress cases (current)", "value": this_stress},
                {"label": "High stress cases (last)", "value": last_stress},
                {"label": "Change", "value": f"{stress_change:+}"},
                {"label": "% Change", "value": f"{stress_change_pct:+}%"},
            ],
        },
        {
            "title": "Journaling Correlation",
            "description": "Journal activity often mirrors engagement and emotional processing.",
            "metrics": [
                {"label": "Journals (current week)", "value": journals_this},
                {"label": "Journals (last week)", "value": journals_last},
                {"label": "Change", "value": f"{journals_this - journals_last:+}"},
            ],
        },
    ]


@app.get("/api/events")
def list_events(current_user: str = Depends(get_current_user)):
    return _load_events()


@app.post("/api/calendar/upload")
async def upload_calendar(file: UploadFile):

    content = await file.read()

    events = _extract_events_from_file(file.filename, content)
    if not events:
        return {"status": "uploaded", "events_extracted": 0}

    try:
        with EVENTS_FILE.open("w", encoding="utf-8") as f:
            json.dump(events, f, indent=2)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to persist events")

    return {"status": "uploaded", "events_extracted": len(events)}


@app.get("/api/reports/top-stats")
def get_top_stats(current_user: str = Depends(get_current_user)):
    query = """
        SELECT 
            (SELECT COUNT(*) FROM user WHERE role = 'student') AS total_students,
            (SELECT COUNT(*) FROM user WHERE is_active = TRUE) AS active_users,
            (SELECT COUNT(*) FROM alert WHERE severity IN ('high','critical') AND status='open') AS at_risk_students,
            (
              SELECT ROUND(AVG(
                CASE mood_level
                    WHEN 'Very Sad' THEN 1
                    WHEN 'Sad' THEN 2
                    WHEN 'Neutral' THEN 3
                    WHEN 'Good' THEN 4
                    WHEN 'Happy' THEN 5
                    WHEN 'Very Happy' THEN 6
                    WHEN 'Excellent' THEN 7
                    ELSE NULL
                END
              ),2)
              FROM emotional_checkin
            ) AS avg_wellness_score
    """
    with engine.connect() as conn:
        row = conn.execute(text(query)).mappings().first()
        return {
            "total_students": row["total_students"],
            "active_users": row["active_users"],
            "at_risk_students": row["at_risk_students"],
            "avg_wellness_score": float(row["avg_wellness_score"] or 0),
        }


@app.get("/api/reports/attention")
def get_attention_students():
    query = """
        SELECT 
            u.user_id,
            u.name,
            COALESCE(a.severity, 'low') AS risk,
            ROUND(AVG(
                CASE e.mood_level
                    WHEN 'Very Sad' THEN 1
                    WHEN 'Sad' THEN 2
                    WHEN 'Neutral' THEN 3
                    WHEN 'Good' THEN 4
                    WHEN 'Happy' THEN 5
                    WHEN 'Very Happy' THEN 6
                    WHEN 'Excellent' THEN 7
                    ELSE NULL
                END
            ), 1) AS score,
            (SELECT name FROM user WHERE user_id = a.assigned_to) AS counselor,
            MAX(a.created_at) AS last_contact,
            GROUP_CONCAT(DISTINCT a.reason SEPARATOR ', ') AS concerns
        FROM user u
        LEFT JOIN alert a ON u.user_id = a.user_id AND a.status='open'
        LEFT JOIN emotional_checkin e ON u.user_id = e.user_id
        WHERE u.role = 'student'
        GROUP BY u.user_id, u.name, a.severity, a.assigned_to
        HAVING risk != 'low'
        ORDER BY score ASC
        LIMIT 10
    """
    with engine.connect() as conn:
        result = conn.execute(text(query)).mappings()
        return [
            {
                "user_id": row["user_id"],
                "name": row["name"],
                "risk": row["risk"].capitalize(),
                "score": f"{row['score'] or 0}/10",
                "counselor": row["counselor"] or "Unassigned",
                "last_contact": row["last_contact"].strftime("%B %d, %Y") if row["last_contact"] else "",
                "concerns": row["concerns"].split(", ") if row["concerns"] else [],
            }
            for row in result
        ]


@app.get("/api/reports/concerns")
def get_concerns(period: str = Query("month", enum=["week", "month"])):
    now = datetime.now()
    if period == "week":
        start = now - timedelta(days=7)
    else:
        start = now.replace(day=1)

    # Attempt to aggregate emotions (comma-separated) from journal_sentiment and checkin_sentiment
    emotions_sql = text(
        """
        SELECT label, COUNT(*) AS students
        FROM (
            SELECT LOWER(TRIM(SUBSTRING_INDEX(js.emotions, ',', 1))) AS label
            FROM journal_sentiment js
            JOIN journal j ON j.journal_id = js.journal_id
            WHERE j.created_at >= :date AND js.emotions IS NOT NULL AND js.emotions <> ''
            UNION ALL
            SELECT LOWER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(js.emotions, ',', 2), ',', -1)))
            FROM journal_sentiment js
            JOIN journal j ON j.journal_id = js.journal_id
            WHERE j.created_at >= :date AND js.emotions LIKE '%,%'
            UNION ALL
            SELECT LOWER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(js.emotions, ',', 3), ',', -1)))
            FROM journal_sentiment js
            JOIN journal j ON j.journal_id = js.journal_id
            WHERE j.created_at >= :date AND js.emotions LIKE '%,%,%'
            UNION ALL
            SELECT LOWER(TRIM(SUBSTRING_INDEX(cs.emotions, ',', 1)))
            FROM checkin_sentiment cs
            JOIN emotional_checkin ec ON ec.checkin_id = cs.checkin_id
            WHERE ec.created_at >= :date AND cs.emotions IS NOT NULL AND cs.emotions <> ''
            UNION ALL
            SELECT LOWER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(cs.emotions, ',', 2), ',', -1)))
            FROM checkin_sentiment cs
            JOIN emotional_checkin ec ON ec.checkin_id = cs.checkin_id
            WHERE ec.created_at >= :date AND cs.emotions LIKE '%,%'
            UNION ALL
            SELECT LOWER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(cs.emotions, ',', 3), ',', -1)))
            FROM checkin_sentiment cs
            JOIN emotional_checkin ec ON ec.checkin_id = cs.checkin_id
            WHERE ec.created_at >= :date AND cs.emotions LIKE '%,%,%'
        ) t
        WHERE t.label IS NOT NULL AND t.label <> ''
        GROUP BY label
        ORDER BY students DESC
        LIMIT 5
        """
    )

    sentiments_sql = text(
        """
        SELECT label, COUNT(*) AS students FROM (
            SELECT LOWER(js.sentiment) AS label
            FROM journal_sentiment js
            JOIN journal j ON j.journal_id = js.journal_id
            WHERE j.created_at >= :date
            UNION ALL
            SELECT LOWER(cs.sentiment)
            FROM checkin_sentiment cs
            JOIN emotional_checkin ec ON ec.checkin_id = cs.checkin_id
            WHERE ec.created_at >= :date
        ) s
        GROUP BY label
        ORDER BY students DESC
        LIMIT 5
        """
    )

    with engine.connect() as conn:
        # Try emotions within requested period
        params = {"date": start.strftime('%Y-%m-%d %H:%M:%S')}
        rows = list(conn.execute(emotions_sql, params).mappings())
        # Fallback to sentiments within requested period
        if not rows:
            rows = list(conn.execute(sentiments_sql, params).mappings())
        # Final fallback: widen window to last 90 days
        if not rows:
            wide_start = (now - timedelta(days=90)).strftime('%Y-%m-%d %H:%M:%S')
            rows = list(conn.execute(emotions_sql, {"date": wide_start}).mappings())
            if not rows:
                rows = list(conn.execute(sentiments_sql, {"date": wide_start}).mappings())
        # Proxy fallback: top alert reasons (last 90 days)
        if not rows:
            alerts_q = text(
                """
                SELECT LOWER(TRIM(reason)) AS label, COUNT(*) AS students
                FROM alert
                WHERE created_at >= :date AND reason IS NOT NULL AND reason <> ''
                GROUP BY LOWER(TRIM(reason))
                ORDER BY students DESC
                LIMIT 5
                """
            )
            rows = list(conn.execute(alerts_q, {"date": (now - timedelta(days=90)).strftime('%Y-%m-%d %H:%M:%S')}).mappings())

        total = sum(int(r["students"]) for r in rows)
        return [
            {
                "label": (r["label"] or "").strip(),
                "students": int(r["students"]),
                "percent": round((int(r["students"]) / total) * 100, 1) if total > 0 else 0,
            }
            for r in rows
        ]


@app.get("/api/reports/interventions")
def get_interventions(period: str = Query("month", enum=["week", "month"])):
    now = datetime.now()
    if period == "week":
        start = now - timedelta(days=7)
    else:
        start = now.replace(day=1)

    summary_q = text(
        """
        SELECT 
          COUNT(*) AS total_alerts,
          SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved_alerts
        FROM alert
        WHERE created_at >= :date
        """
    )

    # Optional: by_type from intervention_log if table exists
    exists_q = text(
        """
        SELECT COUNT(*) AS cnt
        FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = 'intervention_log'
        """
    )
    by_type_q = text(
        """
        SELECT intervention_type AS label,
               COUNT(*) AS participants,
               ROUND(SUM(CASE WHEN outcome IN ('resolved','improved') THEN 1 ELSE 0 END)/COUNT(*)*100,1) AS percent
        FROM intervention_log
        WHERE started_at >= :date
        GROUP BY intervention_type
        ORDER BY participants DESC
        """
    )

    with engine.connect() as conn:
        s = conn.execute(summary_q, {"date": start.strftime('%Y-%m-%d %H:%M:%S')}).mappings().first()
        total_alerts = int(s["total_alerts"] or 0)
        resolved_alerts = int(s["resolved_alerts"] or 0)
        success_rate = round((resolved_alerts / total_alerts) * 100, 1) if total_alerts else 0.0

        has_intervention = conn.execute(exists_q).mappings().first()["cnt"] > 0
        by_type = []
        if has_intervention:
            by_type = [dict(row) for row in conn.execute(by_type_q, {"date": start.strftime('%Y-%m-%d %H:%M:%S')}).mappings()]
        else:
            # Fallback: derive by_type using appointment_log form_type (as proxy)
            fallback_q = text(
                """
                SELECT form_type AS label, COUNT(*) AS participants
                FROM appointment_log
                WHERE downloaded_at >= :date
                GROUP BY form_type
                ORDER BY participants DESC
                """
            )
            rows = conn.execute(fallback_q, {"date": start.strftime('%Y-%m-%d %H:%M:%S')}).mappings()
            total = sum(int(r["participants"]) for r in rows)
            # Re-run to iterate again
            rows = conn.execute(fallback_q, {"date": start.strftime('%Y-%m-%d %H:%M:%S')}).mappings()
            by_type = [
                {
                    "label": r["label"],
                    "participants": int(r["participants"]),
                    "percent": round((int(r["participants"]) / total) * 100, 1) if total > 0 else 0,
                }
                for r in rows
            ]

        return {
            "summary": {
                "total_alerts": total_alerts,
                "resolved_alerts": resolved_alerts,
                "success_rate": success_rate,
            },
            "by_type": by_type,
            "sentiment_change": []  # Optional: populate with advanced analysis later
        }

@app.get("/api/reports/participation")
def get_participation():
    query_total = "SELECT COUNT(*) AS total FROM user WHERE role='student'"
    query_submitted = """
        SELECT COUNT(DISTINCT user_id) AS submitted 
        FROM emotional_checkin
        WHERE created_at >= CURDATE()
    """
    with engine.connect() as conn:
        total = conn.execute(text(query_total)).mappings().first()["total"]
        submitted = conn.execute(text(query_submitted)).mappings().first()["submitted"]
        participation = round((submitted / total) * 100, 1) if total > 0 else 0
    return {"total": total, "submitted": submitted, "participation": participation}

@app.get("/api/users/{user_id}")
def get_user(user_id: int):
    query = """
        SELECT user_id, name, nickname, role
        FROM user
        WHERE user_id = :uid
        LIMIT 1
    """
    with engine.connect() as conn:
        row = conn.execute(text(query), {"uid": user_id}).mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        return {
            "user_id": row["user_id"],
            "name": row["name"],
            "nickname": row["nickname"],
            "role": row["role"],
        }
    
# --- Dashboard: Appointment Logs ---
@app.get("/api/appointment-logs")
def get_appointment_logs(
    user_id: Optional[int] = Query(None),
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(100, ge=1, le=1000),
):
    """Return recent appointment form download logs.
    - Filters: optional user_id; time window by `days` back from now.
    - Limited to `limit` rows, newest first.
    """
    where = ["downloaded_at >= DATE_SUB(NOW(), INTERVAL :days DAY)"]
    params = {"days": days, "limit": limit}
    if user_id is not None:
        where.append("user_id = :uid")
        params["uid"] = user_id

    query = f"""
        SELECT log_id, user_id, form_type, downloaded_at, remarks
        FROM appointment_log
        WHERE {' AND '.join(where)}
        ORDER BY downloaded_at DESC
        LIMIT :limit
    """
    with engine.connect() as conn:
        rows = conn.execute(text(query), params).mappings()
        return [
            {
                "log_id": r["log_id"],
                "user_id": r["user_id"],
                "form_type": r["form_type"],
                "downloaded_at": r["downloaded_at"].strftime("%Y-%m-%d %H:%M:%S") if r["downloaded_at"] else None,
                "remarks": r["remarks"],
            }
            for r in rows
        ]


# --- Dashboard: User Activities (appointments) ---
@app.get("/api/user-activities")
def get_user_activities(
    target_type: Optional[str] = Query(None, description="Filter by target_type, e.g., 'appointment' or 'form'"),
    action: Optional[str] = Query(None, description="Filter by action, e.g., 'open', 'downloaded_form'"),
    user_id: Optional[int] = Query(None),
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(100, ge=1, le=1000),
):
    """Return recent user activities, optionally filtered.
    Defaults to the last 30 days and returns up to `limit` records.
    """
    where = ["created_at >= DATE_SUB(NOW(), INTERVAL :days DAY)"]
    params = {"days": days, "limit": limit}
    if target_type:
        where.append("target_type = :tt")
        params["tt"] = target_type
    if action:
        where.append("action = :ac")
        params["ac"] = action
    if user_id is not None:
        where.append("user_id = :uid")
        params["uid"] = user_id

    query = f"""
        SELECT activity_id, user_id, action, target_type, target_id,
               started_at, ended_at, duration_seconds, created_at
        FROM user_activities
        WHERE {' AND '.join(where)}
        ORDER BY created_at DESC
        LIMIT :limit
    """
    with engine.connect() as conn:
        rows = conn.execute(text(query), params).mappings()
        return [
            {
                "activity_id": r["activity_id"],
                "user_id": r["user_id"],
                "action": r["action"],
                "target_type": r["target_type"],
                "target_id": r["target_id"],
                "started_at": r["started_at"].strftime("%Y-%m-%d %H:%M:%S") if r["started_at"] else None,
                "ended_at": r["ended_at"].strftime("%Y-%m-%d %H:%M:%S") if r["ended_at"] else None,
                "duration_seconds": r["duration_seconds"],
                "created_at": r["created_at"].strftime("%Y-%m-%d %H:%M:%S") if r["created_at"] else None,
            }
            for r in rows
        ]


# --- Counselor profile ---
@app.get("/api/counselor-profile")
def get_counselor_profile(user_id: int = Query(...)):
    """Return counselor profile. If `counselorprofile` table does not exist,
    fall back to the base `user` table.
    """
    with engine.connect() as conn:
        # Check if counselorprofile exists
        exists_q = text(
            """
            SELECT COUNT(*) AS cnt
            FROM information_schema.tables
            WHERE table_schema = DATABASE() AND table_name = 'counselorprofile'
            """
        )
        exists = conn.execute(exists_q).mappings().first()["cnt"] > 0

        if exists:
            query = text(
                """
                SELECT u.user_id, u.name, u.email, u.role,
                       cp.title, cp.department, cp.avatar_url, cp.initials
                FROM user u
                LEFT JOIN counselorprofile cp ON cp.user_id = u.user_id
                WHERE u.user_id = :uid
                LIMIT 1
                """
            )
        else:
            query = text(
                """
                SELECT u.user_id, u.name, u.email, u.role,
                       NULL AS title, NULL AS department, NULL AS avatar_url, NULL AS initials
                FROM user u
                WHERE u.user_id = :uid
                LIMIT 1
                """
            )

        row = conn.execute(query, {"uid": user_id}).mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Counselor not found")

        return {
            "user_id": row["user_id"],
            "name": row["name"],
            "email": row.get("email"),
            "role": row["role"],
            "title": row.get("title"),
            "department": row.get("department"),
            "avatar_url": row.get("avatar_url"),
            "initials": row.get("initials"),
        }


# Run with: 
# For Windows: venv\Scripts\activate 
# For Mac: source .venv/bin/activate
# uvicorn main:app --reload --port 8001
