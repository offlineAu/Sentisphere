from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, text
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
        GROUP BY year, month_num, week_in_month
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
            a.appointment_id AS id,
            u.name AS student,
            a.date,
            a.time,
            c.name AS counselor,
            a.status,
            a.notes
        FROM appointment_log a
        JOIN user u ON a.user_id = u.user_id
        JOIN user c ON a.counselor_id = c.user_id
        WHERE a.date >= CURDATE()
        ORDER BY a.date, a.time
        LIMIT 12
    """
    with engine.connect() as conn:
        result = conn.execute(text(query)).mappings()
        data = [
            {
                "id": row["id"],
                "student": row["student"],
                "date": row["date"].strftime("%Y-%m-%d") if row["date"] else "",
                "time": row["time"],
                "counselor": row["counselor"],
                "status": row["status"],
                "notes": row["notes"],
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

# Run with: uvicorn main:app --reload --port 8001