from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, text
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_URL = "mysql+mysqlconnector://root:@localhost/sentisphere_app"
engine = create_engine(DB_URL)

@app.get("/api/mood-trend")
def mood_trend():
    query = """
        SELECT
            YEAR(created_at) AS year,
            MONTH(created_at) AS month_num,
            MONTHNAME(created_at) AS month_name,
            WEEK(created_at, 3) - WEEK(DATE_SUB(created_at, INTERVAL DAYOFMONTH(created_at)-1 DAY), 3) + 1 AS week_in_month,
            ROUND(AVG(mood_level), 2) AS avgMood
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
        WHERE a.status = 'open'
        ORDER BY a.created_at DESC
        LIMIT 5
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

@app.get("/api/open-appointments")
def open_appointments():
    query = """
        SELECT COUNT(*) AS count
        FROM appointment_log
        WHERE form_type = 'scheduled'
    """
    with engine.connect() as conn:
        result = conn.execute(text(query)).mappings().first()
        return {"count": result["count"]}

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
    
# --- Reports APIs ---

@app.get("/api/reports/top-stats")
def get_top_stats():
    query = """
        SELECT 
            (SELECT COUNT(*) FROM user WHERE role = 'student') AS total_students,
            (SELECT COUNT(*) FROM user WHERE is_active = TRUE) AS active_users,
            (SELECT COUNT(*) FROM alert WHERE severity IN ('high','critical') AND status='open') AS at_risk_students,
            (SELECT ROUND(AVG(mood_level),2) FROM emotional_checkin) AS avg_wellness_score
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
            ROUND(AVG(e.mood_level), 1) AS score,
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

# Run with: 
# venv\Scripts\activate 
# uvicorn main:app --reload --port 8001