-- ============================================================================
-- Migration: Add push_token column to user table AND create notification table
-- ============================================================================
-- This migration:
-- 1. Adds push_token column to user table for Expo push notifications
-- 2. Creates the unified notification table
-- ============================================================================

-- Step 1: Add push_token column to user table
ALTER TABLE user ADD COLUMN IF NOT EXISTS push_token VARCHAR(255) DEFAULT NULL;

-- Step 2: Create unified notification table
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
-- Verify tables were created:
-- ============================================================================
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'user' AND column_name = 'push_token';
-- DESCRIBE notification;
