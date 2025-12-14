/**
 * Centralized time utilities for consistent timestamp handling
 * 
 * IMPORTANT: Railway MySQL server stores ALL timestamps in UTC (server time).
 * All timestamps from the backend are in UTC without timezone indicator.
 * 
 * Use parseTimestamp() for all timestamps from the backend.
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
 * Parse timestamp and return dayjs object in APP_TIMEZONE
 * 
 * Railway MySQL stores timestamps in UTC without timezone indicator.
 * This function explicitly interprets bare timestamps as UTC and converts to Manila time.
 * 
 * iOS-compatible: Uses explicit 'Z' suffix to ensure consistent UTC parsing across platforms.
 */
export const parseTimestamp = (ts: string): dayjs.Dayjs => {
  if (!ts) return dayjs().tz(APP_TIMEZONE);

  // If already has timezone info (Z or +/-), parse as UTC and convert
  if (ts.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(ts)) {
    return dayjs.utc(ts).tz(APP_TIMEZONE);
  }

  // No timezone indicator - EXPLICITLY add 'Z' to force UTC interpretation
  // This ensures consistent behavior across web and iOS
  // Replace space with 'T' for ISO 8601 format compliance
  const isoString = ts.replace(' ', 'T') + 'Z';
  return dayjs.utc(isoString).tz(APP_TIMEZONE);
};

/**
 * @deprecated Use parseTimestamp instead - Railway MySQL stores ALL timestamps in UTC.
 * This function was based on incorrect assumption that chat used local time.
 * Kept for backward compatibility only.
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
 * 
 * Note: Chat messages use parseTimestamp (UTC) because Railway MySQL server
 * stores timestamps in UTC (server time), not Philippine time.
 */
export const formatChatTime = (ts: string): string => {
  if (!ts) return '';
  try {
    return parseTimestamp(ts).format('h:mm A');
  } catch {
    return '';
  }
};

/**
 * Format timestamp for conversation list preview
 * Returns: "12:33 PM" (today), "Yesterday", "Mon", "Dec 5"
 * 
 * Note: Uses parseTimestamp (UTC) because Railway MySQL stores in UTC.
 */
export const formatChatPreview = (ts: string): string => {
  if (!ts) return '';
  try {
    const date = parseTimestamp(ts);
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
 * 
 * Note: Uses parseTimestamp (UTC) because Railway MySQL stores in UTC.
 */
export const formatDateLabel = (ts: string | number): string => {
  if (!ts) return '';
  try {
    // For milliseconds (number), it's already in correct timezone context from getTimestampMs
    // For strings, use parseTimestamp (UTC) for chat context
    const date = typeof ts === 'number'
      ? dayjs(ts).tz(APP_TIMEZONE)
      : parseTimestamp(ts);
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
 * 
 * Note: Uses parseTimestamp (UTC) because Railway MySQL stores in UTC.
 */
export const getTimestampMs = (ts: string): number => {
  if (!ts) return 0;
  try {
    return parseTimestamp(ts).valueOf();
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

