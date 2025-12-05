import { StyleSheet, View, ScrollView, Pressable, Platform, Animated, Easing, ActivityIndicator } from 'react-native';
import { useState, useEffect, useRef, useCallback } from 'react';
import { ThemedText } from '@/components/themed-text';
import { GlobalScreenWrapper } from '@/components/GlobalScreenWrapper';
import { Icon } from '@/components/ui/icon';
import { notificationStore, Notification } from '@/stores/notificationStore';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import { router, useLocalSearchParams } from 'expo-router';

// Brand colors
const BRAND_GREEN = '#10B981';
const BG_COLOR = '#F9FAFB';

// Category styling
const CATEGORY_STYLES: Record<string, { bg: string; text: string; icon: string }> = {
  daily_quote: { bg: '#ECFDF5', text: '#065F46', icon: 'quote' },
  wellness_reminder: { bg: '#FEF3C7', text: '#92400E', icon: 'heart' },
  system: { bg: '#EFF6FF', text: '#1E40AF', icon: 'settings' },
  counselor_message: { bg: '#F3E8FF', text: '#6B21A8', icon: 'message-circle' },
  insight: { bg: '#FFF7ED', text: '#9A3412', icon: 'lightbulb' },
  other: { bg: '#F3F4F6', text: '#374151', icon: 'bell' },
};

export default function NotificationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const API = process.env.EXPO_PUBLIC_API_URL || 'https://sentisphere-production.up.railway.app';

  const [notification, setNotification] = useState<Notification | null>(null);
  const [loading, setLoading] = useState(true);

  // Entrance animations
  const entrance = useRef({
    header: new Animated.Value(0),
    card: new Animated.Value(0),
  }).current;

  const runEntrance = useCallback(() => {
    entrance.header.setValue(0);
    entrance.card.setValue(0);
    Animated.stagger(100, [
      Animated.timing(entrance.header, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(entrance.card, { toValue: 1, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  const makeFadeUp = (v: Animated.Value, distance = 12) => ({
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }],
  });

  useEffect(() => { runEntrance(); }, []);

  const getAuthToken = useCallback(async (): Promise<string | null> => {
    if (Platform.OS === 'web') {
      try { return (window as any)?.localStorage?.getItem('auth_token') || null; } catch { return null; }
    }
    try { return await SecureStore.getItemAsync('auth_token'); } catch { return null; }
  }, []);

  const fetchNotification = async () => {
    if (!id) return;
    
    // First check if we have it in store
    const cached = notificationStore.getNotificationById(Number(id));
    if (cached) {
      setNotification(cached);
      setLoading(false);
      // Mark as read if needed
      if (!cached.is_read) {
        markAsRead(cached.id);
      }
      return;
    }
    
    // Fetch from API
    try {
      const tok = await getAuthToken();
      if (!tok) return;
      const res = await fetch(`${API}/api/notifications/${id}`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNotification(data);
        // Mark as read automatically
        if (!data.is_read) {
          markAsRead(data.id);
        }
      }
    } catch (e) {
      console.error('Failed to fetch notification:', e);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId: number) => {
    // Optimistic update in store
    notificationStore.markAsRead(notificationId);
    
    // Sync with backend
    try {
      const tok = await getAuthToken();
      if (!tok) return;
      await fetch(`${API}/api/notifications/${notificationId}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${tok}` },
      });
    } catch (e) {
      console.error('Failed to mark notification as read:', e);
    }
  };

  useEffect(() => {
    fetchNotification();
  }, [id]);

  const formatTimestamp = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    let relative = '';
    if (diffMins < 1) relative = 'Just now';
    else if (diffMins < 60) relative = `${diffMins} minutes ago`;
    else if (diffHours < 24) relative = `${diffHours} hours ago`;
    else if (diffDays < 7) relative = `${diffDays} days ago`;
    else relative = date.toLocaleDateString();

    const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const fullDate = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    
    return { relative, time, fullDate };
  };

  const getCategoryStyle = (category: string) => {
    return CATEGORY_STYLES[category] || CATEGORY_STYLES.other;
  };

  const goBack = () => {
    if (Platform.OS !== 'web') {
      try { Haptics.selectionAsync(); } catch {}
    }
    router.back();
  };

  const categoryStyle = notification ? getCategoryStyle(notification.category) : CATEGORY_STYLES.other;
  const timestamp = notification ? formatTimestamp(notification.created_at) : null;

  return (
    <GlobalScreenWrapper backgroundColor={BG_COLOR} topPadding={24}>
      <View style={styles.container}>
        {/* Header */}
        <Animated.View style={[styles.header, makeFadeUp(entrance.header)]}>
          <Pressable 
            onPress={goBack} 
            style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Icon name="chevron-left" size={22} color="#374151" />
          </Pressable>
          
          <ThemedText style={styles.headerTitle}>Notification</ThemedText>
          
          <View style={{ width: 44 }} />
        </Animated.View>

        {/* Content */}
        <ScrollView 
          showsVerticalScrollIndicator={false} 
          contentContainerStyle={styles.scrollContent}
        >
          {loading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color={BRAND_GREEN} />
              <ThemedText style={styles.loadingText}>Loading...</ThemedText>
            </View>
          ) : notification ? (
            <Animated.View style={[styles.card, makeFadeUp(entrance.card, 16)]}>
              {/* Title Section */}
              <View style={styles.titleSection}>
                <ThemedText style={styles.title}>
                  {notification.title || 'Notification'}
                </ThemedText>
                <ThemedText style={styles.timestamp}>
                  {timestamp?.relative}
                </ThemedText>
              </View>

              {/* Message Body */}
              <View style={styles.messageSection}>
                <ThemedText style={styles.message}>
                  {notification.message}
                </ThemedText>
              </View>

              {/* Metadata Section */}
              <View style={styles.metaSection}>
                {/* Category pill */}
                <View style={styles.metaRow}>
                  <View style={[styles.categoryPill, { backgroundColor: categoryStyle.bg }]}>
                    <Icon name={categoryStyle.icon as any} size={14} color={categoryStyle.text} />
                    <ThemedText style={[styles.categoryText, { color: categoryStyle.text }]}>
                      {notification.category.replace(/_/g, ' ')}
                    </ThemedText>
                  </View>
                </View>

                {/* Date & Time */}
                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <Icon name="clock" size={14} color="#9CA3AF" />
                    <ThemedText style={styles.metaText}>
                      {timestamp?.fullDate} at {timestamp?.time}
                    </ThemedText>
                  </View>
                </View>

                {/* Source */}
                {notification.source && (
                  <View style={styles.metaRow}>
                    <View style={styles.sourcePill}>
                      <ThemedText style={styles.sourceText}>
                        Source: {notification.source}
                      </ThemedText>
                    </View>
                  </View>
                )}

                {/* Related Alert ID */}
                {notification.related_alert_id && (
                  <View style={styles.metaRow}>
                    <View style={styles.sourcePill}>
                      <ThemedText style={styles.sourceText}>
                        Alert #{notification.related_alert_id}
                      </ThemedText>
                    </View>
                  </View>
                )}
              </View>
            </Animated.View>
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrapper}>
                <Icon name="bell" size={32} color="#9CA3AF" />
              </View>
              <ThemedText style={styles.emptyTitle}>Notification not found</ThemedText>
              <ThemedText style={styles.emptySubtitle}>
                This notification may have been removed
              </ThemedText>
            </View>
          )}
        </ScrollView>
      </View>
    </GlobalScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    marginBottom: 8,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: 'rgba(0,0,0,0.05)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  backButtonPressed: {
    backgroundColor: '#F9FAFB',
    transform: [{ scale: 0.96 }],
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
    color: '#374151',
  },
  scrollContent: {
    paddingBottom: 32,
    flexGrow: 1,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: 'rgba(0,0,0,0.05)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 3,
    overflow: 'hidden',
  },
  titleSection: {
    padding: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  title: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    color: '#111827',
    lineHeight: 28,
    marginBottom: 6,
  },
  timestamp: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: '#9CA3AF',
  },
  messageSection: {
    padding: 20,
  },
  message: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: '#374151',
    lineHeight: 26,
  },
  metaSection: {
    padding: 20,
    paddingTop: 0,
    gap: 12,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#6B7280',
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  categoryText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'capitalize',
  },
  sourcePill: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  sourceText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: '#6B7280',
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingTop: 100,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: '#6B7280',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingTop: 100,
    paddingHorizontal: 32,
  },
  emptyIconWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
    color: '#374151',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 20,
  },
});
