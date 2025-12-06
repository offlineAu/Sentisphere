/**
 * Centralized time utilities for consistent timestamp handling
 * 
 * IMPORTANT: The backend stores timestamps differently for different tables:
 * - Notifications: stored in UTC without timezone indicator
 * - Chat messages: stored in Philippine Time (server local time) without timezone indicator
 * 
 * Use parseTimestamp() for notifications and parseLocalTimestamp() for chat.
 * All times are displayed in Philippine Time (Asia/Manila).
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
 * Parse timestamp for NOTIFICATIONS and return dayjs object in APP_TIMEZONE
 * 
 * Railway/PostgreSQL stores notification timestamps in UTC without timezone indicator.
 * Timestamps with Z suffix or timezone offset are explicitly treated as UTC.
 * Bare timestamps (no timezone) are treated as UTC and converted to display timezone.
 */
export const parseTimestamp = (ts: string): dayjs.Dayjs => {
  if (!ts) return dayjs().tz(APP_TIMEZONE);

  // If already has timezone info (Z or +/-), parse as UTC and convert
  if (ts.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(ts)) {
    return dayjs.utc(ts).tz(APP_TIMEZONE);
  }

  // No timezone indicator - treat as UTC (notification DB stores in UTC)
  // and convert to Philippine Time for display
  return dayjs.utc(ts).tz(APP_TIMEZONE);
};

/**
 * Parse timestamp for CHAT MESSAGES and return dayjs object in APP_TIMEZONE
 * 
 * Chat messages are stored in Philippine Time (server local time) without timezone indicator.
 * This function treats bare timestamps as already being in Philippine Time.
 */
export const parseLocalTimestamp = (ts: string): dayjs.Dayjs => {
  if (!ts) return dayjs().tz(APP_TIMEZONE);

  // If already has timezone info (Z or +/-), parse as UTC and convert
  if (ts.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(ts)) {
    return dayjs.utc(ts).tz(APP_TIMEZONE);
  }

  // No timezone indicator - treat as Philippine Time (server local time)
  // Use dayjs.tz to parse the timestamp AS Philippine Time (not convert TO it)
  return dayjs.tz(ts, APP_TIMEZONE);
};

/**
 * @deprecated Use parseTimestamp or parseLocalTimestamp instead
 * Kept for backward compatibility but now returns the original timestamp
 */
export const normalizeTimestamp = (ts: string): string => {
  return ts;
};

/**
 * Format timestamp for chat message bubbles
 * Returns time in format: "12:33 PM"
 * Uses parseLocalTimestamp since chat messages are stored in Philippine time
 */
export const formatChatTime = (ts: string): string => {
  if (!ts) return '';
  try {
    return parseLocalTimestamp(ts).format('h:mm A');
  } catch {
    return '';
  }
};

/**
 * Format timestamp for conversation list preview
 * Returns: "12:33 PM" (today), "Yesterday", "Mon", "Dec 5"
 * Uses parseLocalTimestamp since chat messages are stored in Philippine time
 */
export const formatChatPreview = (ts: string): string => {
  if (!ts) return '';
  try {
    const date = parseLocalTimestamp(ts);
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
 * Uses parseLocalTimestamp since chat messages are stored in Philippine time
 */
export const formatDateLabel = (ts: string | number): string => {
  if (!ts) return '';
  try {
    // For milliseconds (number), it's already in correct timezone context from getTimestampMs
    // For strings, use parseLocalTimestamp for chat context
    const date = typeof ts === 'number'
      ? dayjs(ts).tz(APP_TIMEZONE)
      : parseLocalTimestamp(ts);
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
 * Returns milliseconds that can be used for sorting
 * Uses parseLocalTimestamp since this is primarily used for chat messages
 */
export const getTimestampMs = (ts: string): number => {
  if (!ts) return 0;
  try {
    return parseLocalTimestamp(ts).valueOf();
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

