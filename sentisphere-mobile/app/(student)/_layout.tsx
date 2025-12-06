import { useEffect, useState } from 'react';
import { Platform, BackHandler } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Stack, useRouter, useSegments } from 'expo-router';
import { 
  initializePushNotifications,
  setupGlobalNotificationListeners,
  cleanupGlobalNotificationListeners
} from '@/utils/notifications';

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

        // 2. If no token, redirect to auth
        if (!token) {
          console.log('[Auth] No stored token found - showing login screen');
          setAuthorized(false);
          router.replace('/auth');
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
            // Token invalid/expired - clear it and show login
            console.log('[Auth] ✗ Token invalid (status:', response.status, ') - clearing and showing login');
            await clearStoredToken();
            setAuthorized(false);
            router.replace('/auth');
          }
        } catch (error) {
          console.log('[Auth] ✗ Token validation failed:', error);
          // Network error or backend unreachable - clear token and show login
          await clearStoredToken();
          if (isMounted) {
            setAuthorized(false);
            router.replace('/auth');
          }
        }
      } catch (error) {
        console.log('[Auth] Error during auth check:', error);
        if (!isMounted) {
          return;
        }
        setAuthorized(false);
        router.replace('/auth');
      }
    };

    checkAuth();

    return () => {
      isMounted = false;
    };
  }, [router]);

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
    if (Platform.OS === 'web') return;

    console.log('[Push] === PUSH SETUP START ===');
    
    // Initialize Expo push notifications for both Android and iOS
    initializePushNotifications(userId);
    
    // Setup global listeners (singleton - safe to call multiple times)
    setupGlobalNotificationListeners();
    
    console.log('[Push] === PUSH SETUP COMPLETE ===');

    // Cleanup on unmount (e.g., when user navigates away or logs out)
    return () => {
      // Note: We don't cleanup here normally because listeners should persist
      // Cleanup happens explicitly on logout via cleanupGlobalNotificationListeners()
    };
  }, [authorized, userId]);

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
