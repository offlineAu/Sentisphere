from flask import Flask, jsonify
from flask_cors import CORS
from sqlalchemy import create_engine, text

app = Flask(__name__)
CORS(app)

# Update with your actual DB credentials
DB_URL = "mysql+mysqlconnector://root:@localhost/sentisphere_app"
engine = create_engine(DB_URL)

@app.route("/api/mood-trend")
def mood_trend():
    query = """
        SELECT
            YEAR(created_at) AS year,
            WEEK(created_at) AS week,
            ROUND(AVG(mood_level), 2) AS avgMood
        FROM emotional_checkin
        GROUP BY year, week
        ORDER BY year, week
    """
    with engine.connect() as conn:
        result = conn.execute(text(query)).mappings()
        data = [
            {
                "week": f"{row['year']}-W{str(row['week']).zfill(2)}",
                "avgMood": float(row["avgMood"] or 0)
            }
            for row in result
        ]
    return jsonify(data)

@app.route("/api/recent-alerts")
def recent_alerts():
    query = """
        SELECT
            a.alert_id,
            u.name AS student_name,
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
                "id": row["alert_id"],
                "name": row["student_name"],
                "reason": row["reason"],
                "severity": row["severity"],
                "status": row["status"],
                "created_at": row["created_at"].strftime("%Y-%m-%d %H:%M:%S") if row["created_at"] else "",
            }
            for row in result
        ]
    return jsonify(data)

if __name__ == "__main__":
    app.run(debug=True)