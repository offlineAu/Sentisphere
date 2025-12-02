-- Migration: Add saved_resources table for persisting user's saved learning materials
-- Date: 2024-12-02

-- Option 1: Create a new dedicated table for saved resources (recommended)
-- This is cleaner than modifying resource_log which may have different purposes

CREATE TABLE IF NOT EXISTS saved_resources (
    saved_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    resource_type VARCHAR(50) NOT NULL DEFAULT 'topic',  -- 'topic', 'article', etc.
    resource_id VARCHAR(100) NOT NULL,                    -- topic ID from the app (e.g., 'stress', 'anxiety')
    title VARCHAR(255),                                   -- cached title for quick display
    metadata JSON,                                        -- optional metadata (tags, description, etc.)
    saved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_saved_resources_user
        FOREIGN KEY (user_id) REFERENCES user(user_id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_resource (user_id, resource_type, resource_id)
);

-- Create index for faster lookups
CREATE INDEX idx_saved_resources_user ON saved_resources(user_id);
CREATE INDEX idx_saved_resources_type ON saved_resources(resource_type);

-- Option 2: If you prefer to enhance the existing resource_log table instead:
-- ALTER TABLE resource_log ADD COLUMN user_id INT;
-- ALTER TABLE resource_log ADD COLUMN resource_id VARCHAR(100);
-- ALTER TABLE resource_log ADD COLUMN resource_type VARCHAR(50) DEFAULT 'topic';
-- ALTER TABLE resource_log ADD CONSTRAINT fk_resource_log_user FOREIGN KEY (user_id) REFERENCES user(user_id);
-- CREATE INDEX idx_resource_log_user ON resource_log(user_id);
