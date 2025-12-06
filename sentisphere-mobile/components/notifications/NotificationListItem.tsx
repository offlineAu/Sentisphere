import { StyleSheet, View, Pressable, Platform } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import * as Haptics from 'expo-haptics';
import type { Notification } from '@/stores/notificationStore';
import { parseTimestamp } from '@/utils/time';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

const APP_TIMEZONE = 'Asia/Manila';

// Brand colors
const BRAND_GREEN = '#10B981';
const UNREAD_BG = '#ECFDF5';
const READ_BG = '#FFFFFF';
const BORDER_COLOR = '#F1F5F9';
const SHADOW_COLOR = 'rgba(0,0,0,0.05)';

// Category styling
const CATEGORY_STYLES: Record<string, { bg: string; text: string; icon: string }> = {
  daily_quote: { bg: '#ECFDF5', text: '#065F46', icon: 'quote' },
  wellness_reminder: { bg: '#FEF3C7', text: '#92400E', icon: 'heart' },
  system: { bg: '#EFF6FF', text: '#1E40AF', icon: 'settings' },
  counselor_message: { bg: '#F3E8FF', text: '#6B21A8', icon: 'message-circle' },
  insight: { bg: '#FFF7ED', text: '#9A3412', icon: 'lightbulb' },
  other: { bg: '#F3F4F6', text: '#374151', icon: 'bell' },
};

interface NotificationListItemProps {
  notification: Notification;
  onPress: (notification: Notification) => void;
}

export function NotificationListItem({ notification, onPress }: NotificationListItemProps) {
  const isUnread = !notification.is_read;
  const categoryStyle = CATEGORY_STYLES[notification.category] || CATEGORY_STYLES.other;

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const date = parseTimestamp(dateStr);
      const now = dayjs().tz(APP_TIMEZONE);
      const diffMins = now.diff(date, 'minute');
      const diffHours = now.diff(date, 'hour');
      const diffDays = now.diff(date, 'day');

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.format('MMM D');
    } catch {
      return '';
    }
  };

  const handlePress = () => {
    if (Platform.OS !== 'web') {
      try { Haptics.selectionAsync(); } catch { }
    }
    onPress(notification);
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.container,
        isUnread ? styles.unreadContainer : styles.readContainer,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${isUnread ? 'Unread ' : ''}notification: ${notification.title || 'Notification'}`}
    >
      {/* Unread indicator dot */}
      {isUnread && <View style={styles.unreadDot} />}

      {/* Category icon */}
      <View style={[styles.iconWrapper, { backgroundColor: categoryStyle.bg }]}>
        <Icon name={categoryStyle.icon as any} size={20} color={categoryStyle.text} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.topRow}>
          <ThemedText
            style={[styles.title, isUnread && styles.unreadTitle]}
            numberOfLines={1}
          >
            {notification.title || 'Notification'}
          </ThemedText>
          <ThemedText style={styles.timestamp}>
            {formatDate(notification.created_at)}
          </ThemedText>
        </View>

        <ThemedText style={styles.preview} numberOfLines={2}>
          {notification.message}
        </ThemedText>
      </View>

      {/* Chevron */}
      <View style={styles.chevronWrapper}>
        <Icon name="chevron-right" size={16} color="#D1D5DB" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    // Shadow
    shadowColor: SHADOW_COLOR,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 2,
  },
  readContainer: {
    backgroundColor: READ_BG,
    borderColor: BORDER_COLOR,
  },
  unreadContainer: {
    backgroundColor: UNREAD_BG,
    borderColor: '#D1FAE5',
  },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.995 }],
  },
  unreadDot: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: BRAND_GREEN,
    zIndex: 1,
  },
  iconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    gap: 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#1F2937',
  },
  unreadTitle: {
    fontFamily: 'Inter_700Bold',
    color: '#111827',
  },
  timestamp: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: '#9CA3AF',
  },
  preview: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#6B7280',
    lineHeight: 18,
  },
  chevronWrapper: {
    marginLeft: 4,
  },
});
