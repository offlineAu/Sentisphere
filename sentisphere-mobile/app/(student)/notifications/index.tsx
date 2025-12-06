import { StyleSheet, View, FlatList, Pressable, Platform, RefreshControl, Animated, Easing, ActivityIndicator } from 'react-native';
import { useState, useEffect, useRef, useCallback } from 'react';
import { ThemedText } from '@/components/themed-text';
import { GlobalScreenWrapper } from '@/components/GlobalScreenWrapper';
import { Icon } from '@/components/ui/icon';
import { NotificationListItem } from '@/components/notifications/NotificationListItem';
import { notificationStore, Notification } from '@/stores/notificationStore';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

// Brand colors
const BRAND_GREEN = '#10B981';
const BG_COLOR = '#F9FAFB';

export default function NotificationsScreen() {
  const API = process.env.EXPO_PUBLIC_API_URL || 'https://sentisphere-production.up.railway.app';

  const [notifications, setNotifications] = useState<Notification[]>(notificationStore.getNotifications());
  const [loading, setLoading] = useState(notificationStore.getIsLoading());
  const [refreshing, setRefreshing] = useState(false);

  // Subscribe to store changes
  useEffect(() => {
    const unsubscribe = notificationStore.subscribe(() => {
      setNotifications(notificationStore.getNotifications());
      setLoading(notificationStore.getIsLoading());
    });
    return unsubscribe;
  }, []);

  // Entrance animations
  const entrance = useRef({
    header: new Animated.Value(0),
    content: new Animated.Value(0),
  }).current;

  const runEntrance = useCallback(() => {
    entrance.header.setValue(0);
    entrance.content.setValue(0);
    Animated.stagger(80, [
      Animated.timing(entrance.header, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(entrance.content, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  const makeFadeUp = (v: Animated.Value) => ({
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
  });

  useEffect(() => { runEntrance(); }, []);
  
  useFocusEffect(useCallback(() => { 
    runEntrance(); 
    fetchNotifications(); 
    return () => {}; 
  }, []));

  const getAuthToken = useCallback(async (): Promise<string | null> => {
    if (Platform.OS === 'web') {
      try { return (window as any)?.localStorage?.getItem('auth_token') || null; } catch { return null; }
    }
    try { return await SecureStore.getItemAsync('auth_token'); } catch { return null; }
  }, []);

  const fetchNotifications = async () => {
    try {
      const tok = await getAuthToken();
      if (!tok) {
        notificationStore.setLoading(false);
        return;
      }
      const res = await fetch(`${API}/api/notifications?limit=100`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) {
        const data = await res.json();
        notificationStore.setNotifications(data.notifications || []);
      }
    } catch (e) {
      console.error('Failed to fetch notifications:', e);
    } finally {
      notificationStore.setLoading(false);
      setRefreshing(false);
    }
  };

  const markAsRead = async (notificationId: number) => {
    // Optimistic update
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

  const handleNotificationPress = async (notification: Notification) => {
    // Mark as read immediately (optimistic)
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
    // Navigate to detail
    router.push(`/(student)/notifications/${notification.id}` as any);
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };

  const goBack = () => {
    if (Platform.OS !== 'web') {
      try { Haptics.selectionAsync(); } catch {}
    }
    router.back();
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

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
          
          <View style={styles.headerCenter}>
            <ThemedText style={styles.headerTitle}>Notifications</ThemedText>
            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <ThemedText style={styles.unreadBadgeText}>{unreadCount}</ThemedText>
              </View>
            )}
          </View>
          
          <View style={{ width: 44 }} />
        </Animated.View>

        {/* Content */}
        <Animated.View style={[styles.content, makeFadeUp(entrance.content)]}>
          {loading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color={BRAND_GREEN} />
              <ThemedText style={styles.loadingText}>Loading notifications...</ThemedText>
            </View>
          ) : notifications.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrapper}>
                <Icon name="bell" size={32} color="#9CA3AF" />
              </View>
              <ThemedText style={styles.emptyTitle}>No notifications yet</ThemedText>
              <ThemedText style={styles.emptySubtitle}>
                When you receive notifications, they'll appear here
              </ThemedText>
            </View>
          ) : (
            <FlatList
              data={notifications}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => (
                <NotificationListItem
                  notification={item}
                  onPress={handleNotificationPress}
                />
              )}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={BRAND_GREEN}
                  colors={[BRAND_GREEN]}
                />
              }
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          )}
        </Animated.View>
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
    // Shadow
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
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    color: '#111827',
  },
  unreadBadge: {
    backgroundColor: BRAND_GREEN,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 24,
    alignItems: 'center',
  },
  unreadBadgeText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 32,
    paddingTop: 4,
  },
  separator: {
    height: 12,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingBottom: 80,
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
    paddingBottom: 80,
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
