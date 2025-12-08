-- USTP full schema + medium mock data (final)
-- Generated: 2025-10-27 12:00:00
-- Updated: 2025-12-02 - Railway compatible (VARCHAR instead of ENUM)
SET FOREIGN_KEY_CHECKS=0;
DROP TABLE IF EXISTS saved_resources, appointment_log, messages, conversations, user_activities, resource_log, notification, alert, checkin_sentiment, emotional_checkin, journal_sentiment, journal, counselor_profile, user, ai_insights;

SET FOREIGN_KEY_CHECKS=0;

-- ============================
-- USER TABLE
-- ============================
CREATE TABLE user (
    user_id INT PRIMARY KEY AUTO_INCREMENT,
    email VARCHAR(100) UNIQUE DEFAULT NULL,
    name VARCHAR(100),
    role VARCHAR(20) NOT NULL CHECK (role IN ('student', 'counselor')),
    password_hash VARCHAR(255),
    push_token VARCHAR(255),
    nickname VARCHAR(50),
    last_login DATETIME,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================
-- COUNSELOR PROFILE
-- ============================
CREATE TABLE counselor_profile (
    user_id INT PRIMARY KEY,
    department VARCHAR(100),
    contact_number VARCHAR(20),
    availability VARCHAR(100),
    year_experience INT,
    phone VARCHAR(50),
    license_number VARCHAR(100),
    specializations TEXT,
    education TEXT,
    bio TEXT,
    languages VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user(user_id)
);

-- ============================
-- JOURNAL
-- ============================
CREATE TABLE journal (
    journal_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    deleted_at DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user(user_id)
);

CREATE TABLE journal_sentiment (
    journal_sentiment_id INT PRIMARY KEY AUTO_INCREMENT,
    journal_id INT,
    sentiment VARCHAR(50),
    emotions VARCHAR(255),
    confidence FLOAT,
    model_version VARCHAR(50),
    analyzed_at DATETIME,
    FOREIGN KEY (journal_id) REFERENCES journal(journal_id)
);

-- ============================
-- EMOTIONAL CHECKINS
-- ============================
CREATE TABLE emotional_checkin (
    checkin_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    mood_level VARCHAR(20) NOT NULL CHECK (mood_level IN ('Awesome', 'Great', 'Loved', 'Okay', 'Meh', 'Anxious', 'Bad', 'Terrible', 'Upset')),
    energy_level VARCHAR(20) NOT NULL CHECK (energy_level IN ('Low', 'Moderate', 'High')),
    stress_level VARCHAR(30) NOT NULL CHECK (stress_level IN ('No Stress', 'Low Stress', 'Moderate', 'High Stress', 'Very High Stress')),
    feel_better VARCHAR(10) CHECK (feel_better IN ('Yes', 'No', 'Same')),
    comment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES user(user_id)
);

CREATE TABLE checkin_sentiment (
    checkin_sentiment_id INT PRIMARY KEY AUTO_INCREMENT,
    checkin_id INT,
    sentiment VARCHAR(50),
    emotions VARCHAR(255),
    confidence FLOAT,
    model_version VARCHAR(50),
    analyzed_at DATETIME,
    FOREIGN KEY (checkin_id) REFERENCES emotional_checkin(checkin_id)
);

-- Alert table (must be created BEFORE notification due to foreign key)
CREATE TABLE alert (
    alert_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    reason VARCHAR(255),
    severity VARCHAR(10) NOT NULL DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high')),
    assigned_to INT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME NULL,

    INDEX idx_user_id (user_id),
    INDEX idx_assigned_to (assigned_to),
    INDEX idx_severity (severity),
    INDEX idx_status (status),

    CONSTRAINT fk_alert_user
        FOREIGN KEY (user_id) REFERENCES user(user_id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT fk_alert_assigned_to
        FOREIGN KEY (assigned_to) REFERENCES user(user_id)
        ON DELETE SET NULL ON UPDATE CASCADE
);

-- ============================
-- NOTIFICATIONS
-- ============================
CREATE TABLE notification (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(150) NULL,
    message TEXT NOT NULL,
    category VARCHAR(30) NOT NULL CHECK (category IN ('daily_quote', 'wellness_reminder', 'system', 'counselor_message', 'insight', 'other')),
    source VARCHAR(20) NOT NULL CHECK (source IN ('scheduler', 'alert_trigger', 'manual', 'system')),
    related_alert_id INT NULL,
    is_sent BOOLEAN DEFAULT FALSE,
    sent_at DATETIME NULL,
    is_read BOOLEAN DEFAULT FALSE,
    read_at DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_notification_user
        FOREIGN KEY (user_id) REFERENCES user(user_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_notification_alert
        FOREIGN KEY (related_alert_id) REFERENCES alert(alert_id)
        ON DELETE SET NULL
);


-- ============================
-- CONVERSATIONS / MESSAGES
-- ============================
CREATE TABLE conversations (
    conversation_id INT PRIMARY KEY AUTO_INCREMENT,
    initiator_user_id INT NOT NULL,
    initiator_role VARCHAR(20) NOT NULL,
    subject VARCHAR(100),
    counselor_id INT,
    status VARCHAR(10) DEFAULT 'open' CHECK (status IN ('open', 'ended')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_activity_at DATETIME,

    FOREIGN KEY (initiator_user_id) REFERENCES user(user_id),
    FOREIGN KEY (counselor_id) REFERENCES user(user_id)
);

CREATE TABLE messages (
    message_id INT PRIMARY KEY AUTO_INCREMENT,
    conversation_id INT NOT NULL,
    sender_id INT NOT NULL,
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id),
    FOREIGN KEY (sender_id) REFERENCES user(user_id)
);

-- ============================
-- APPOINTMENT LOG
-- ============================
CREATE TABLE appointment_log (
    log_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT,
    form_type VARCHAR(100),
    downloaded_at DATETIME,
    remarks TEXT,
    FOREIGN KEY (user_id) REFERENCES user(user_id)
);

-- ============================
-- AI INSIGHTS
-- ============================
CREATE TABLE ai_insights (
  insight_id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT DEFAULT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('weekly', 'behavioral')),
  timeframe_start DATE NOT NULL,
  timeframe_end DATE NOT NULL,
  data JSON NOT NULL,
  risk_level VARCHAR(10) DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  generated_by VARCHAR(100),
  generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_insight (user_id, type, timeframe_start, timeframe_end),
  FOREIGN KEY (user_id) REFERENCES user(user_id)
);

-- Saved resources for user's bookmarked learning materials
CREATE TABLE saved_resources (
    saved_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    resource_type VARCHAR(50) NOT NULL DEFAULT 'topic',
    resource_id VARCHAR(100) NOT NULL,
    title VARCHAR(255),
    metadata JSON,
    saved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_saved_resources_user
        FOREIGN KEY (user_id) REFERENCES user(user_id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_resource (user_id, resource_type, resource_id)
);

-- Indexes for better query performance
CREATE INDEX idx_alert_user ON alert(user_id);
CREATE INDEX idx_alert_severity ON alert(severity);
CREATE INDEX idx_notification_user ON notification(user_id);
CREATE INDEX idx_notification_category ON notification(category);
CREATE INDEX idx_saved_resources_user ON saved_resources(user_id);

SET FOREIGN_KEY_CHECKS=1;