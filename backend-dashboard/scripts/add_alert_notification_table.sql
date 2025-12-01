-- ============================================================================
-- Migration: Unified Notification Table
-- ============================================================================
-- This creates the unified notification table for all push notifications:
-- - Daily motivational quotes (scheduler-based)
-- - High-risk wellness reminders (alert-triggered)
-- - System notifications
-- - Counselor messages
-- - Insights
-- ============================================================================

-- Add push_token column to user table if not exists
ALTER TABLE user ADD COLUMN IF NOT EXISTS push_token VARCHAR(255) DEFAULT NULL;

-- Drop old notification table if exists (backup first in production!)
-- DROP TABLE IF EXISTS notification;

-- Create unified notification table
CREATE TABLE IF NOT EXISTS notification (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(150) NULL,
    message TEXT NOT NULL,
    
    -- Category defines the type of notification
    category ENUM(
        'daily_quote',
        'wellness_reminder',
        'system',
        'counselor_message',
        'insight',
        'other'
    ) NOT NULL,
    
    -- Source defines where the notification originated
    source ENUM(
        'scheduler',
        'alert_trigger',
        'manual',
        'system'
    ) NOT NULL,
    
    -- Link to alert for wellness reminders (optional)
    related_alert_id INT NULL,
    
    -- Delivery status
    is_sent BOOLEAN DEFAULT FALSE,
    sent_at DATETIME NULL,
    
    -- Read status
    is_read BOOLEAN DEFAULT FALSE,
    read_at DATETIME NULL,
    
    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign keys
    CONSTRAINT fk_notification_user 
        FOREIGN KEY (user_id) REFERENCES user(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_notification_alert 
        FOREIGN KEY (related_alert_id) REFERENCES alert(alert_id) ON DELETE SET NULL,
    
    -- Indexes for common queries
    INDEX idx_notification_user (user_id),
    INDEX idx_notification_category (category),
    INDEX idx_notification_created (created_at),
    INDEX idx_notification_user_unread (user_id, is_read),
    INDEX idx_notification_alert (related_alert_id)
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add comment to table
ALTER TABLE notification 
    COMMENT = 'Unified push notification storage for daily quotes, wellness reminders, and system messages.';

-- ============================================================================
-- Example queries for reference:
-- ============================================================================

-- Get unread notifications for a user:
-- SELECT * FROM notification WHERE user_id = ? AND is_read = FALSE ORDER BY created_at DESC;

-- Get daily quotes sent today:
-- SELECT * FROM notification WHERE category = 'daily_quote' AND DATE(created_at) = CURDATE();

-- Get wellness reminders for an alert:
-- SELECT * FROM notification WHERE related_alert_id = ? AND category = 'wellness_reminder';

-- Check for duplicate wellness reminder in last 24 hours:
-- SELECT * FROM notification WHERE user_id = ? AND category = 'wellness_reminder' 
--   AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR) LIMIT 1;
