/**
 * Centralized time utilities for consistent timestamp handling
 * All timestamps are normalized to UTC and displayed in Philippine Time
 */

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import calendar from 'dayjs/plugin/calendar';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(calendar);

// All timestamps should be shown in Philippine Time
const APP_TIMEZONE = 'Asia/Manila';

/**
 * Ensure timestamps lacking a Z suffix are treated as UTC
 * Backend may return timestamps without the Z indicator
 */
export const normalizeTimestamp = (ts: string): string => {
  if (!ts) return ts;
  // If already has timezone info (Z or +/-), return as-is
  if (ts.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(ts)) {
    return ts;
  }
  // Assume UTC if no timezone specified
  return ts + 'Z';
};

/**
 * Format timestamp for chat message bubbles
 * Returns time in format: "12:33 PM"
 */
export const formatChatTime = (ts: string): string => {
  if (!ts) return '';
  try {
    return dayjs.utc(normalizeTimestamp(ts)).tz(APP_TIMEZONE).format('h:mm A');
  } catch {
    return '';
  }
};

/**
 * Format timestamp for conversation list preview
 * Returns: "12:33 PM" (today), "Yesterday", "Mon", "Dec 5"
 */
export const formatChatPreview = (ts: string): string => {
  if (!ts) return '';
  try {
    const date = dayjs.utc(normalizeTimestamp(ts)).tz(APP_TIMEZONE);
    const now = dayjs().tz(APP_TIMEZONE);
    
    // Same day - show time
    if (date.isSame(now, 'day')) {
      return date.format('h:mm A');
    }
    
    // Yesterday
    if (date.isSame(now.subtract(1, 'day'), 'day')) {
      return 'Yesterday';
    }
    
    // Within last 7 days - show day name
    if (date.isAfter(now.subtract(7, 'day'))) {
      return date.format('ddd');
    }
    
    // Older - show date
    return date.format('MMM D');
  } catch {
    return '';
  }
};

/**
 * Format timestamp for date separators in chat
 * Returns: "Today", "Yesterday", or "December 5, 2024"
 */
export const formatDateLabel = (ts: string | number): string => {
  if (!ts) return '';
  try {
    const date = typeof ts === 'number' 
      ? dayjs(ts).tz(APP_TIMEZONE)
      : dayjs.utc(normalizeTimestamp(ts)).tz(APP_TIMEZONE);
    const now = dayjs().tz(APP_TIMEZONE);
    
    if (date.isSame(now, 'day')) {
      return 'Today';
    }
    
    if (date.isSame(now.subtract(1, 'day'), 'day')) {
      return 'Yesterday';
    }
    
    return date.format('MMMM D, YYYY');
  } catch {
    return '';
  }
};

/**
 * Get timestamp in milliseconds for sorting/comparison
 * Properly handles UTC normalization
 */
export const getTimestampMs = (ts: string): number => {
  if (!ts) return 0;
  try {
    return dayjs.utc(normalizeTimestamp(ts)).valueOf();
  } catch {
    return 0;
  }
};

/**
 * Get current time formatted for new messages
 * Used when sending a message to show immediate feedback
 */
export const getCurrentChatTime = (): string => {
  return dayjs().tz(APP_TIMEZONE).format('h:mm A');
};
