import { useEffect, useState, useRef } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Stack, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { 
  initializePushNotifications, 
  addNotificationReceivedListener, 
  addNotificationResponseListener,
  removeNotificationListener 
} from '@/utils/notifications';

export default function StudentLayout() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

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

  // Initialize push notifications when authorized
  useEffect(() => {
    if (authorized && Platform.OS !== 'web') {
      // Initialize push notifications
      initializePushNotifications();

      // Listen for notifications received while app is foregrounded
      notificationListener.current = addNotificationReceivedListener(notification => {
        console.log('Notification received:', notification);
      });

      // Listen for notification taps
      responseListener.current = addNotificationResponseListener(response => {
        console.log('Notification tapped:', response);
        // You can navigate to specific screens based on notification data here
        const data = response.notification.request.content.data;
        if (data?.type === 'daily_quote') {
          // Could navigate to a quotes screen or show a modal
          console.log('Daily quote notification tapped');
        }
      });

      return () => {
        if (notificationListener.current) {
          removeNotificationListener(notificationListener.current);
        }
        if (responseListener.current) {
          removeNotificationListener(responseListener.current);
        }
      };
    }
  }, [authorized]);

  if (authorized !== true) {
    return null;
  }

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="appointments/index" options={{ title: 'Appointments' }} />
      <Stack.Screen name="analytics/index" options={{ title: 'Analytics' }} />
    </Stack>
  );
}
