-- Migration: Add title column to journal table
-- Date: 2024-12-03
-- Description: Adds a title column to the journal table for better organization of journal entries

-- Check if column exists before adding (safe to run multiple times)
-- For MySQL/MariaDB:

-- Add the title column if it doesn't exist
ALTER TABLE journal
ADD COLUMN IF NOT EXISTS title VARCHAR(255) NULL AFTER user_id;

-- Alternative syntax for MySQL versions that don't support IF NOT EXISTS:
-- Run this if the above fails:
-- ALTER TABLE journal ADD COLUMN title VARCHAR(255) NULL AFTER user_id;

-- Verify the change
-- DESCRIBE journal;
