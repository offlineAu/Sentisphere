import { useEffect, useState, useCallback } from 'react';
import { Platform, BackHandler } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Stack, useRouter, useSegments } from 'expo-router';
import {
  initializePushNotifications,
  setupGlobalNotificationListeners,
  cleanupGlobalNotificationListeners
} from '@/utils/notifications';
import { notificationStore } from '@/stores/notificationStore';

export default function StudentLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  /**
   * Handle Android hardware back button.
   * When user is logged in and on the main tabs (dashboard), prevent going back to auth screen.
   * This keeps the user in the app instead of accidentally logging out.
   */
  useEffect(() => {
    if (Platform.OS !== 'android' || !authorized) return;

    const onBackPress = () => {
      // Cast segments to string array to avoid TypeScript strict typing issues
      const segmentStrings = segments as string[];

      // Check if we're on the main tabs (dashboard area)
      const isOnMainTabs = segmentStrings.some(s => s.includes('(tabs)') || s.includes('tabs'));
      const isOnDashboard = segmentStrings.some(s => s.includes('dashboard'));

      // If on main tabs or dashboard with no deep navigation, prevent back
      if (isOnMainTabs && !segmentStrings.some(s => s.includes('appointments') || s.includes('analytics'))) {
        // On main dashboard - prevent back to auth screen
        return true; // Prevent default back behavior
      }

      // Allow normal back navigation for other screens (appointments, chat details, etc.)
      return false;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [authorized, segments]);

  // Check authentication - this runs first, BEFORE any push notification logic
  useEffect(() => {
    let isMounted = true;
    const API = process.env.EXPO_PUBLIC_API_URL || 'https://sentisphere-production.up.railway.app';

    const clearStoredToken = async () => {
      try {
        if (Platform.OS === 'web') {
          window.localStorage?.removeItem('auth_token');
        } else {
          await SecureStore.deleteItemAsync('auth_token');
        }
      } catch (e) {
        console.log('[Auth] Error clearing token:', e);
      }
    };

    const checkAuth = async () => {
      try {
        let token: string | null = null;

        // 1. Try to get stored token
        if (Platform.OS === 'web') {
          token = typeof window !== 'undefined' ? window.localStorage?.getItem('auth_token') ?? null : null;
        } else {
          token = await SecureStore.getItemAsync('auth_token');
        }

        if (!isMounted) {
          return;
        }

        // 2. If no token, redirect to splash/index to handle onboarding flow
        if (!token) {
          console.log('[Auth] No stored token found - redirecting to splash for onboarding');
          setAuthorized(false);
          router.replace('/');
          return;
        }

        // 3. Validate token with backend before accepting it
        console.log('[Auth] Found stored token, validating with backend...');
        try {
          const response = await fetch(`${API}/api/auth/mobile/me`, {
            headers: { Authorization: `Bearer ${token}` }
          });

          if (!isMounted) {
            return;
          }

          if (response.ok) {
            const userData = await response.json();
            const uid = String(userData.user_id || userData.id || '');
            console.log('[Auth] ✓ Token valid for user:', userData.nickname, '(id:', uid, ')');
            setUserId(uid);
            setAuthorized(true);
          } else {
            // Token invalid/expired - clear it and redirect to splash
            console.log('[Auth] ✗ Token invalid (status:', response.status, ') - clearing and redirecting to splash');
            await clearStoredToken();
            setAuthorized(false);
            router.replace('/');
          }
        } catch (error) {
          console.log('[Auth] ✗ Token validation failed:', error);
          // Network error or backend unreachable - clear token and redirect to splash
          await clearStoredToken();
          if (isMounted) {
            setAuthorized(false);
            router.replace('/');
          }
        }
      } catch (error) {
        console.log('[Auth] Error during auth check:', error);
        if (!isMounted) {
          return;
        }
        setAuthorized(false);
        router.replace('/');
      }
    };

    checkAuth();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const API = process.env.EXPO_PUBLIC_API_URL || 'https://sentisphere-production.up.railway.app';

  // Fetch notifications from backend and update store
  const fetchNotifications = useCallback(async () => {
    try {
      let token: string | null = null;
      if (Platform.OS === 'web') {
        token = window.localStorage?.getItem('auth_token') || null;
      } else {
        token = await SecureStore.getItemAsync('auth_token');
      }
      if (!token) return;

      const res = await fetch(`${API}/api/notifications?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        notificationStore.setNotifications(data.notifications || []);
        console.log('[Push] ✓ Notifications refreshed, unread:', notificationStore.getUnreadCount());
      }
    } catch (e) {
      console.error('[Push] Failed to fetch notifications:', e);
    }
  }, []);

  /**
   * Initialize push notifications AFTER successful authentication.
   * 
   * NEW ARCHITECTURE:
   * - Uses centralized initializePushNotifications(userId) with SecureStore caching
   * - Uses singleton setupGlobalNotificationListeners() - exactly ONE set
   * - Cleanup handled by cleanupGlobalNotificationListeners()
   * 
   * This is completely optional and will NOT block the app.
   */
  useEffect(() => {
    if (!authorized || !userId) return;

    // Initial fetch to populate notification store on app launch (works on all platforms)
    fetchNotifications();

    // Push notifications only work on native platforms
    if (Platform.OS === 'web') return;

    console.log('[Push] === PUSH SETUP START ===');

    // Initialize Expo push notifications for both Android and iOS
    initializePushNotifications(userId);

    // Setup global listeners with callback to refresh notifications when push is received
    setupGlobalNotificationListeners(() => {
      console.log('[Push] New notification received - refreshing notifications...');
      fetchNotifications();
    });

    console.log('[Push] === PUSH SETUP COMPLETE ===');

    // Cleanup on unmount (e.g., when user navigates away or logs out)
    return () => {
      // Note: We don't cleanup here normally because listeners should persist
      // Cleanup happens explicitly on logout via cleanupGlobalNotificationListeners()
    };
  }, [authorized, userId, fetchNotifications]);

  if (authorized !== true) {
    return null;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="appointments/index" options={{ headerShown: false }} />
      <Stack.Screen name="analytics/index" options={{ headerShown: false }} />
      <Stack.Screen name="notifications/index" options={{ headerShown: false }} />
      <Stack.Screen name="notifications/[id]" options={{ headerShown: false }} />
    </Stack>
  );
}
