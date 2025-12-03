import { useEffect, useState, useRef } from 'react';
import { Platform, BackHandler } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { 
  initializePushNotifications, 
  addNotificationReceivedListener, 
  addNotificationResponseListener,
  removeNotificationListener 
} from '@/utils/notifications';

export default function StudentLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

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

    const checkAuth = async () => {
      try {
        let token: string | null = null;

        if (Platform.OS === 'web') {
          token = typeof window !== 'undefined' ? window.localStorage?.getItem('auth_token') ?? null : null;
        } else {
          token = await SecureStore.getItemAsync('auth_token');
        }

        if (!isMounted) {
          return;
        }

        if (token) {
          setAuthorized(true);
        } else {
          setAuthorized(false);
          router.replace('/auth');
        }
      } catch {
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
   * IMPORTANT: This is completely optional and will NOT:
   * - Block authentication
   * - Prevent the app from working if it fails
   * - Crash the app on any errors
   * 
   * Push notifications require:
   * - Physical device (or iOS simulator with limitations)
   * - EAS Dev Build (not Expo Go) for full functionality
   * - User permission granted
   */
  useEffect(() => {
    if (!authorized) return;
    if (Platform.OS === 'web') return;

    let mounted = true;

    const setupPushNotifications = async () => {
      try {
        // Initialize push notifications (requests permission, gets token, registers with backend)
        // This is wrapped in try-catch and will NOT crash the app
        await initializePushNotifications();

        if (!mounted) return;

        // Setup notification listeners for when app is in foreground
        notificationListener.current = addNotificationReceivedListener(notification => {
          console.log('[Notification] Received in foreground:', notification.request.content.title);
        });

        // Setup tap listener for when user taps on notification
        responseListener.current = addNotificationResponseListener(response => {
          console.log('[Notification] User tapped notification');
          const data = response.notification.request.content.data;
          
          // Handle different notification types
          if (data?.category === 'daily_quote') {
            console.log('[Notification] Daily quote tapped');
            // Could navigate to a quotes/wellness screen
          } else if (data?.category === 'wellness_reminder') {
            console.log('[Notification] Wellness reminder tapped');
            // Could navigate to counselor info or support screen
          }
        });
      } catch (error) {
        // Log but don't crash - push notifications are optional
        console.error('[Push] Error setting up notifications:', error);
      }
    };

    setupPushNotifications();

    // Cleanup listeners on unmount
    return () => {
      mounted = false;
      if (notificationListener.current) {
        removeNotificationListener(notificationListener.current);
      }
      if (responseListener.current) {
        removeNotificationListener(responseListener.current);
      }
    };
  }, [authorized]);

  if (authorized !== true) {
    return null;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="appointments/index" options={{ headerShown: false }} />
      <Stack.Screen name="analytics/index" options={{ headerShown: false }} />
    </Stack>
  );
}
