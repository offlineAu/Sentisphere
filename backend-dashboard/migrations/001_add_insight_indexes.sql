-- Migration: Add indexes for Insight System performance optimization
-- Date: 2025-12-01
-- Description: Add indexes on analyzed_at columns and composite indexes for common queries

-- ============================================================================
-- JOURNAL_SENTIMENT INDEXES
-- ============================================================================

-- Index on analyzed_at for date range filtering (HIGH PRIORITY)
CREATE INDEX IF NOT EXISTS idx_journal_sentiment_analyzed_at 
ON journal_sentiment(analyzed_at);

-- Composite index for journal sentiment lookups
CREATE INDEX IF NOT EXISTS idx_journal_sentiment_journal_analyzed 
ON journal_sentiment(journal_id, analyzed_at DESC);

-- ============================================================================
-- CHECKIN_SENTIMENT INDEXES
-- ============================================================================

-- Index on analyzed_at for date range filtering (HIGH PRIORITY)
CREATE INDEX IF NOT EXISTS idx_checkin_sentiment_analyzed_at 
ON checkin_sentiment(analyzed_at);

-- Composite index for checkin sentiment lookups
CREATE INDEX IF NOT EXISTS idx_checkin_sentiment_checkin_analyzed 
ON checkin_sentiment(checkin_id, analyzed_at DESC);

-- ============================================================================
-- EMOTIONAL_CHECKIN INDEXES
-- ============================================================================

-- Composite index for user + date queries (HIGH PRIORITY)
CREATE INDEX IF NOT EXISTS idx_emotional_checkin_user_date 
ON emotional_checkin(user_id, created_at);

-- Index for stress level filtering
CREATE INDEX IF NOT EXISTS idx_emotional_checkin_stress 
ON emotional_checkin(stress_level, created_at);

-- Index for mood level filtering
CREATE INDEX IF NOT EXISTS idx_emotional_checkin_mood 
ON emotional_checkin(mood_level, created_at);

-- ============================================================================
-- JOURNAL INDEXES
-- ============================================================================

-- Composite index for user + date queries (HIGH PRIORITY)
CREATE INDEX IF NOT EXISTS idx_journal_user_date 
ON journal(user_id, created_at);

-- Index for soft-delete filtering
CREATE INDEX IF NOT EXISTS idx_journal_deleted 
ON journal(deleted_at);

-- Composite index for non-deleted journals by user
CREATE INDEX IF NOT EXISTS idx_journal_user_active 
ON journal(user_id, deleted_at, created_at);

-- ============================================================================
-- ALERT INDEXES
-- ============================================================================

-- Composite index for alert filtering by user and severity
CREATE INDEX IF NOT EXISTS idx_alert_user_severity 
ON alert(user_id, severity, status);

-- Index for date-based alert queries
CREATE INDEX IF NOT EXISTS idx_alert_created 
ON alert(created_at);

-- ============================================================================
-- AI_INSIGHTS INDEXES
-- ============================================================================

-- Composite index for insight lookups by type and timeframe
CREATE INDEX IF NOT EXISTS idx_ai_insights_type_start 
ON ai_insights(type, timeframe_start);

-- Index for user-specific insight queries
CREATE INDEX IF NOT EXISTS idx_ai_insights_user_type 
ON ai_insights(user_id, type, timeframe_start DESC);

-- Index for risk level filtering
CREATE INDEX IF NOT EXISTS idx_ai_insights_risk 
ON ai_insights(risk_level, generated_at DESC);

-- ============================================================================
-- USER_ACTIVITIES INDEXES
-- ============================================================================

-- Composite index for activity lookups
CREATE INDEX IF NOT EXISTS idx_user_activities_user_date 
ON user_activities(user_id, created_at);

-- ============================================================================
-- APPOINTMENT_LOG INDEXES
-- ============================================================================

-- Composite index for appointment log queries
CREATE INDEX IF NOT EXISTS idx_appointment_log_user_date 
ON appointment_log(user_id, downloaded_at);

-- ============================================================================
-- CONVERSATIONS INDEXES
-- ============================================================================

-- Index for counselor conversation listing
CREATE INDEX IF NOT EXISTS idx_conversations_counselor_activity 
ON conversations(counselor_id, last_activity_at DESC);

-- Index for student conversation listing
CREATE INDEX IF NOT EXISTS idx_conversations_initiator 
ON conversations(initiator_user_id, last_activity_at DESC);

-- ============================================================================
-- MESSAGES INDEXES
-- ============================================================================

-- Index for unread message counts
CREATE INDEX IF NOT EXISTS idx_messages_conversation_read 
ON messages(conversation_id, is_read, timestamp);

-- ============================================================================
-- NOTIFICATION INDEXES
-- ============================================================================

-- Index for user notification queries
CREATE INDEX IF NOT EXISTS idx_notification_user_read 
ON notification(user_id, is_read, created_at DESC);

-- ============================================================================
-- VERIFY INDEXES EXIST (for idempotency check)
-- ============================================================================

-- Run this SELECT to verify all indexes were created:
-- SELECT TABLE_NAME, INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS 
-- WHERE TABLE_SCHEMA = DATABASE() AND INDEX_NAME LIKE 'idx_%';
