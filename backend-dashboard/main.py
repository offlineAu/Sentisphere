from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from datetime import datetime, timedelta
import os
from collections import Counter
import re
import typing
from pydantic import BaseModel
from typing import List, Optional

from app.core.config import settings
from app.db.database import engine
from app.api.routes.auth import router as auth_router

app = FastAPI(title=settings.APP_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Optional auth router (not enforced on other routes)
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])

@app.get("/api/mood-trend")
def mood_trend():
    query = """
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
    with engine.connect() as conn:
        result = conn.execute(text(query)).mappings()
        data = [
            {
                "week": f"{row['year']}-{row['month_name']}-Week{row['week_in_month']}",
                "avgMood": float(row["avgMood"] or 0)
            }
            for row in result
        ]
    return data

@app.get("/api/sentiments")
def sentiment_breakdown(period: str = Query("month", enum=["week", "month", "year"])):
    now = datetime.now()
    if period == "week":
        start = now - timedelta(days=7)
    elif period == "year":
        start = now.replace(month=1, day=1)
    else:  # month
        start = now.replace(day=1)

    # Combine sentiments from both tables
    query = """
        SELECT sentiment, COUNT(*) AS value FROM (
            SELECT sentiment, analyzed_at FROM checkin_sentiment
            UNION ALL
            SELECT sentiment, analyzed_at FROM journal_sentiment
        ) AS combined
        WHERE analyzed_at >= :date
        GROUP BY sentiment
    """
    with engine.connect() as conn:
        result = conn.execute(text(query), {"date": start.strftime('%Y-%m-%d %H:%M:%S')}).mappings()
        # Ensure data is always an array and chart-friendly
        data = [{"name": row["sentiment"], "value": row["value"]} for row in result]
        return data

@app.get("/api/checkin-breakdown")
def checkin_breakdown(period: str = Query("month", enum=["week", "month", "year"])):
    now = datetime.now()
    if period == "week":
        start = now - timedelta(days=7)
    elif period == "year":
        start = now.replace(month=1, day=1)
    else:
        start = now.replace(day=1)

    q_mood = text(
        """
        SELECT mood_level AS label, COUNT(*) AS value
        FROM emotional_checkin
        WHERE created_at >= :date
        GROUP BY mood_level
        """
    )
    q_energy = text(
        """
        SELECT energy_level AS label, COUNT(*) AS value
        FROM emotional_checkin
        WHERE created_at >= :date
        GROUP BY energy_level
        """
    )
    q_stress = text(
        """
        SELECT stress_level AS label, COUNT(*) AS value
        FROM emotional_checkin
        WHERE created_at >= :date
        GROUP BY stress_level
        """
    )
    with engine.connect() as conn:
        params = {"date": start.strftime('%Y-%m-%d %H:%M:%S')}
        mood_rows = conn.execute(q_mood, params).mappings()
        energy_rows = conn.execute(q_energy, params).mappings()
        stress_rows = conn.execute(q_stress, params).mappings()
        return {
            "mood": [{"label": r["label"], "value": r["value"]} for r in mood_rows],
            "energy": [{"label": r["label"], "value": r["value"]} for r in energy_rows],
            "stress": [{"label": r["label"], "value": r["value"]} for r in stress_rows],
        }

# -----------------------------
# AI Summaries (heuristic fallback)
# -----------------------------

def _period_start(now: datetime, period: str) -> datetime:
    if period == "week":
        return now - timedelta(days=7)
    if period == "year":
        return now.replace(month=1, day=1)
    return now.replace(day=1)

def _top_keywords(texts, k=3):
    STOP = set("""
    the a an and or but if while to for from of in on at with by is are was were be been being i you he she it we they them us our your their my mine ours yours theirs this that these those as not no yes do does did have has had can could should would will just very about into over under more most less least than then so because also one two three four five six seven eight nine ten
    """.split())
    words = []
    for t in texts:
        for w in re.findall(r"[A-Za-z][A-Za-z\-']{2,}", t or ""):
            wl = w.lower()
            if wl not in STOP:
                words.append(wl)
    common = [w for w,_ in Counter(words).most_common(k)]
    return common

def _maybe_llm_summary(prompt: str) -> str | None:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None
    try:
        import openai  # type: ignore
        openai.api_key = api_key
        resp = openai.ChatCompletion.create(
            model="gpt-3.5-turbo",
            messages=[{"role":"system","content":"You are a concise school counseling dashboard summarizer."},
                      {"role":"user","content": prompt}],
            temperature=0.2,
            max_tokens=120,
        )
        return resp.choices[0].message["content"].strip()
    except Exception:
        return None

@app.get("/api/ai/sentiment-summary")
def ai_sentiment_summary(period: str = Query("month", enum=["week","month","year"])):
    now = datetime.now()
    start = _period_start(now, period)
    # Pull sentiment counts (exclude 'mixed')
    q = text(
        """
        SELECT LOWER(sentiment) AS name, COUNT(*) AS value
        FROM checkin_sentiment cs
        JOIN emotional_checkin ec ON ec.checkin_id = cs.checkin_id
        WHERE ec.created_at >= :date AND sentiment IN ('positive','negative','neutral')
        GROUP BY sentiment
        """
    )
    # Pull recent journals/comments text
    q_texts = text(
        """
        (
          SELECT comment AS txt, created_at FROM emotional_checkin
          WHERE created_at >= :date AND comment IS NOT NULL AND comment <> ''
          ORDER BY created_at DESC LIMIT 50
        )
        UNION ALL
        (
          SELECT content AS txt, created_at FROM journal
          WHERE created_at >= :date AND content IS NOT NULL AND content <> ''
          ORDER BY created_at DESC LIMIT 50
        )
        ORDER BY created_at DESC LIMIT 60
        """
    )
    with engine.connect() as conn:
        rows = list(conn.execute(q, {"date": start.strftime('%Y-%m-%d %H:%M:%S')}).mappings())
        totals = {r["name"]: int(r["value"]) for r in rows}
        texts = [r["txt"] for r in conn.execute(q_texts, {"date": start.strftime('%Y-%m-%d %H:%M:%S')}).mappings()]
    positive = totals.get("positive", 0)
    neutral = totals.get("neutral", 0)
    negative = totals.get("negative", 0)
    all_total = positive + neutral + negative
    p = lambda n: round((n / all_total) * 100) if all_total else 0
    keywords = _top_keywords(texts, 3)
    heuristic = f"Overall this period: Positive {p(positive)}%, Neutral {p(neutral)}%, Negative {p(negative)}%. Common themes include: {', '.join(keywords) if keywords else 'no clear recurring terms'}."
    # Optional LLM
    llm = _maybe_llm_summary(
        f"Summarize student sentiment this {period}. Positive={positive}, Neutral={neutral}, Negative={negative}."
        f" Mention the trend and reference common themes from journals/comments: {keywords}. Keep it under 2 sentences."
    )
    return {"summary": llm or heuristic}

@app.get("/api/ai/mood-summary")
def ai_mood_summary(period: str = Query("month", enum=["week","month","year"])):
    now = datetime.now()
    start = _period_start(now, period)
    # Weekly averages via ENUM mapping
    q = text(
        """
        SELECT DATE(ec.created_at) AS d,
               ROUND(AVG(CASE ec.mood_level
                    WHEN 'Very Sad' THEN 1 WHEN 'Sad' THEN 2 WHEN 'Neutral' THEN 3
                    WHEN 'Good' THEN 4 WHEN 'Happy' THEN 5 WHEN 'Very Happy' THEN 6 WHEN 'Excellent' THEN 7 END),2) AS avgMood
        FROM emotional_checkin ec
        WHERE ec.created_at >= :date
        GROUP BY DATE(ec.created_at)
        ORDER BY d
        """
    )
    q_texts = text(
        """
        SELECT comment AS txt FROM emotional_checkin
        WHERE created_at >= :date AND comment IS NOT NULL AND comment <> ''
        ORDER BY created_at DESC LIMIT 60
        """
    )
    with engine.connect() as conn:
        rows = list(conn.execute(q, {"date": start.strftime('%Y-%m-%d %H:%M:%S')}).mappings())
        texts = [r["txt"] for r in conn.execute(q_texts, {"date": start.strftime('%Y-%m-%d %H:%M:%S')}).mappings()]
    vals = [float(r["avgMood"] or 0) for r in rows]
    trend = "stable"
    if len(vals) >= 2:
        diff = vals[-1] - vals[0]
        if diff > 0.4: trend = "improving"
        elif diff < -0.4: trend = "declining"
    keywords = _top_keywords(texts, 3)
    heuristic = f"Weekly mood appears {trend}. Notable themes from comments: {', '.join(keywords) if keywords else 'no clear recurring terms'}."
    llm = _maybe_llm_summary(
        f"Given a 1-7 mood scale (1=Very Sad..7=Excellent), summarize the mood trend this {period} as a counselor dashboard note."
        f" Daily averages: {vals}. Trend should be one word (improving/declining/stable) and cite themes from comments: {keywords}."
    )
    return {"summary": llm or heuristic}

@app.get("/api/appointments")
def appointments():
    query = """
        SELECT
            a.log_id AS id,
            u.name AS student,
            a.form_type,
            a.downloaded_at,
            a.remarks
        FROM appointment_log a
        JOIN user u ON a.user_id = u.user_id
        WHERE a.downloaded_at >= CURDATE()
        ORDER BY a.downloaded_at
        LIMIT 12
    """
    with engine.connect() as conn:
        result = conn.execute(text(query)).mappings()
        data = [
            {
                "id": row["id"],
                "student": row["student"],
                "form_type": row["form_type"],
                "downloaded_at": row["downloaded_at"].strftime("%Y-%m-%d %H:%M:%S") if row["downloaded_at"] else "",
                "remarks": row["remarks"],
            }
            for row in result
        ]
    return data

@app.get("/api/recent-alerts")
def recent_alerts():
    query = """
        SELECT
            a.alert_id AS id,
            u.name AS name,
            a.reason,
            a.severity,
            a.status,
            a.created_at
        FROM alert a
        JOIN user u ON a.user_id = u.user_id
        WHERE a.status IN ('open', 'in_progress', 'resolved')
        ORDER BY a.created_at DESC
    """
    with engine.connect() as conn:
        result = conn.execute(text(query)).mappings()
        data = [
            {
                "id": row["id"],
                "name": row["name"],
                "reason": row["reason"],
                "severity": row["severity"],
                "status": row["status"],
                "created_at": row["created_at"].strftime("%Y-%m-%d %H:%M:%S") if row["created_at"] else "",
            }
            for row in result
        ]
    return data

@app.get("/api/all-alerts")
def all_alerts():
    query = """
        SELECT
            a.alert_id AS id,
            u.name AS name,
            a.reason,
            a.severity,
            a.status,
            a.created_at
        FROM alert a
        JOIN user u ON a.user_id = u.user_id
        WHERE a.status IN ('open', 'in_progress', 'resolved')
        ORDER BY a.created_at DESC
    """
    with engine.connect() as conn:
        result = conn.execute(text(query)).mappings()
        data = [
            {
                "id": row["id"],
                "name": row["name"],
                "reason": row["reason"],
                "severity": row["severity"],
                "status": row["status"],
                "created_at": row["created_at"].strftime("%Y-%m-%d %H:%M:%S") if row["created_at"] else "",
            }
            for row in result
        ]
    return data

@app.get("/api/students-monitored")
def students_monitored():
    query = """
        SELECT COUNT(*) AS count
        FROM user
        WHERE role = 'student' AND is_active = TRUE
    """
    with engine.connect() as conn:
        result = conn.execute(text(query)).mappings().first()
        return {"count": result["count"]}

# --- This Week Check-ins ---
@app.get("/api/this-week-checkins")
def this_week_checkins():
    query = """
        SELECT COUNT(*) AS count
        FROM emotional_checkin
        WHERE YEARWEEK(created_at, 3) = YEARWEEK(CURDATE(), 3);
    """
    with engine.connect() as conn:
        result = conn.execute(text(query)).mappings().first()
        return {"count": result["count"]}

# --- Open Appointments (User Activities) ---
@app.get("/api/open-appointments")
def open_appointments():
    query = """
        SELECT COUNT(DISTINCT user_id) AS count
        FROM user_activities
        WHERE action IN ('downloaded_form')
          AND target_type = 'form'
          AND created_at >= DATE_SUB(NOW(), INTERVAL 1 WEEK)
    """
    with engine.connect() as conn:
        result = conn.execute(text(query)).mappings().first()
        return {"count": result["count"]}

# --- High-Risk Flags (Alerts + Sentiments) ---
@app.get("/api/high-risk-flags")
def high_risk_flags():
    query_alert = """
        SELECT COUNT(*) AS count
        FROM alert
        WHERE severity IN ('high', 'critical')
            AND status IN ('open', 'in_progress');
    """
    query_journal = """
        SELECT COUNT(*) AS count
        FROM journal_sentiment
        WHERE sentiment = 'negative'
          AND analyzed_at >= DATE_SUB(NOW(), INTERVAL 1 WEEK)
    """
    query_checkin = """
        SELECT COUNT(*) AS count
        FROM checkin_sentiment
        WHERE sentiment = 'negative'
          AND analyzed_at >= DATE_SUB(NOW(), INTERVAL 1 WEEK)
    """
    with engine.connect() as conn:
        alert_count = conn.execute(text(query_alert)).mappings().first()["count"]
        journal_count = conn.execute(text(query_journal)).mappings().first()["count"]
        checkin_count = conn.execute(text(query_checkin)).mappings().first()["count"]
        total = alert_count + journal_count + checkin_count
        return {"count": total}

# --- Conversations list ---
@app.get("/api/conversations")
def get_conversations(user_id: int = Query(...)):
    query = """
        SELECT DISTINCT
            c.conversation_id AS id,
            c.initiator_user_id,
            c.initiator_role,
            c.subject,
            c.status,
            c.created_at,
            c.last_activity_at,
            u.nickname AS initiator_nickname
        FROM conversations c
        LEFT JOIN messages m ON c.conversation_id = m.conversation_id
        JOIN user u ON c.initiator_user_id = u.user_id
        WHERE c.initiator_user_id = :uid   -- student initiated
           OR m.sender_id = :uid           -- counselor/admin/student sent messages
        ORDER BY c.last_activity_at DESC, c.created_at DESC
    """
    with engine.connect() as conn:
        result = conn.execute(text(query), {"uid": user_id}).mappings()
        return [dict(row) for row in result]


# --- Messages per conversation ---
@app.get("/api/conversations/{conversation_id}/messages")
def get_messages(conversation_id: int):
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
from pydantic import BaseModel

class MessageIn(BaseModel):
    sender_id: int
    content: str

@app.post("/api/conversations/{conversation_id}/messages")
def send_message(conversation_id: int, message: MessageIn):
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

# --- Mark messages as read in a conversation ---
@app.post("/api/conversations/{conversation_id}/read")
def mark_conversation_read(conversation_id: int, user_id: int = Query(...)):
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

@app.get("/api/reports/top-stats")
def get_top_stats():
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
def get_concerns():
    query = """
        SELECT reason AS label, COUNT(*) AS students
        FROM alert
        WHERE status='open'
        GROUP BY reason
        ORDER BY students DESC
        LIMIT 5
    """
    with engine.connect() as conn:
        result = conn.execute(text(query)).mappings()
        total = sum([row["students"] for row in result])
        return [
            {
                "label": row["label"],
                "students": row["students"],
                "percent": round((row["students"]/total)*100, 1) if total > 0 else 0
            }
            for row in result
        ]


@app.get("/api/reports/interventions")
def get_interventions():
    query = """
        SELECT form_type AS label, COUNT(*) AS participants
        FROM appointment_log
        GROUP BY form_type
    """
    with engine.connect() as conn:
        result = conn.execute(text(query)).mappings()
        total = sum([row["participants"] for row in result])
        return [
            {
                "label": row["label"],
                "participants": row["participants"],
                "percent": round((row["participants"]/total)*100, 1) if total > 0 else 0
            }
            for row in result
        ]

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
