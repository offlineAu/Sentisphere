/**
 * Push Notification utilities for Expo SDK 51+
 * 
 * IMPORTANT: Push notifications require:
 * - Physical device (not simulator/emulator for full functionality)
 * - EAS Dev Build (not Expo Go) for production-like testing
 * - Proper EAS projectId in app.json/app.config.js
 * 
 * Handles permission requests, token registration, and notification handling.
 * Login/signup flows are NOT blocked by push token - it's registered AFTER auth.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const API = process.env.EXPO_PUBLIC_API_URL || 'https://sentisphere-production.up.railway.app';

/**
 * Configure notification behavior globally (should be called once at app startup)
 * This determines how notifications are displayed when the app is in foreground.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Get auth token from storage
 */
async function getAuthToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return (window as any)?.localStorage?.getItem('auth_token') || null;
    } catch {
      return null;
    }
  }
  try {
    return await SecureStore.getItemAsync('auth_token');
  } catch {
    return null;
  }
}

/**
 * Request notification permissions and get the Expo push token.
 * 
 * Expo SDK 51+ requirements:
 * - Must provide projectId from EAS config
 * - Android requires notification channel setup
 * - Only works on physical devices (or simulators with limitations)
 * 
 * @returns Expo push token string or null if unavailable
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  let token: string | null = null;

  // Setup Android notification channel FIRST (SDK 51+ requirement)
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
      console.log('[Push] Android notification channel configured');
    } catch (error) {
      console.warn('[Push] Failed to setup Android notification channel:', error);
    }
  }

  // Check if running on physical device
  if (!Device.isDevice) {
    console.log('[Push] Push notifications require a physical device. Running on simulator/emulator.');
    // Note: On iOS simulator, push tokens may still work for testing in some cases
    // On Android emulator, push notifications typically don't work
    if (Platform.OS === 'android') {
      return null;
    }
    // Continue for iOS simulator (limited functionality)
  }

  // Web doesn't support Expo push notifications
  if (Platform.OS === 'web') {
    console.log('[Push] Push notifications not supported on web platform');
    return null;
  }

  try {
    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    console.log('[Push] Existing permission status:', existingStatus);

    // Request permission if not granted
    if (existingStatus !== 'granted') {
      console.log('[Push] Requesting notification permissions...');
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('[Push] Push notification permission not granted. User declined or restricted.');
      return null;
    }

    // Get EAS projectId from config
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    
    if (!projectId) {
      console.error('[Push] Missing EAS projectId in app config (app.json/app.config.js)');
      console.error('[Push] Please add: "extra": { "eas": { "projectId": "YOUR_PROJECT_ID" } }');
      console.error('[Push] Get your projectId from: https://expo.dev/accounts/[account]/projects/[project]');
      return null;
    }

    console.log('[Push] Using EAS projectId:', projectId);

    // Get the Expo push token
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    token = tokenData.data;

    // Log the token prominently for testing
    console.log('========================================');
    console.log('Expo Push Token:', token);
    console.log('Test at: https://expo.dev/notifications');
    console.log('========================================');

    return token;
  } catch (error) {
    console.error('[Push] Failed to get push token:', error);
    // Don't crash the app - push notifications are optional
    return null;
  }
}

/**
 * Register the push token with the backend.
 * 
 * This is called AFTER successful login/signup - it's optional and won't block auth.
 * Accepts { push_token: string } and stores it for the authenticated user.
 * 
 * @param pushToken - The Expo push token to register
 * @returns true if successful, false otherwise
 */
export async function registerPushTokenWithBackend(pushToken: string | null): Promise<boolean> {
  // Don't attempt if no token provided
  if (!pushToken) {
    console.log('[Push] No push token provided, skipping backend registration');
    return false;
  }

  try {
    const authToken = await getAuthToken();
    if (!authToken) {
      console.log('[Push] No auth token available, skipping push token registration');
      console.log('[Push] This is expected if called before login');
      return false;
    }

    console.log('[Push] Registering push token with backend...');
    
    const response = await fetch(`${API}/api/push-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ push_token: pushToken }),
    });

    if (response.ok) {
      console.log('[Push] ✓ Push token registered with backend successfully');
      return true;
    } else {
      const errorText = await response.text().catch(() => '');
      console.error('[Push] Failed to register push token:', response.status, errorText);
      // Don't crash - push registration is optional
      return false;
    }
  } catch (error) {
    console.error('[Push] Failed to register push token with backend:', error);
    // Don't crash - push registration is optional
    return false;
  }
}

/**
 * Unregister push token from backend (call on logout)
 * 
 * This removes the user's push token so they won't receive notifications
 * after logging out.
 */
export async function unregisterPushToken(): Promise<boolean> {
  try {
    const authToken = await getAuthToken();
    if (!authToken) {
      console.log('[Push] No auth token, nothing to unregister');
      return true;
    }

    console.log('[Push] Unregistering push token from backend...');
    
    const response = await fetch(`${API}/api/push-token`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    if (response.ok) {
      console.log('[Push] ✓ Push token unregistered successfully');
    }

    return response.ok;
  } catch (error) {
    console.error('[Push] Failed to unregister push token:', error);
    // Don't block logout on push token errors
    return false;
  }
}

/**
 * Initialize push notifications - call this AFTER successful login/signup.
 * 
 * This function:
 * 1. Requests notification permissions (if not granted)
 * 2. Gets the Expo push token
 * 3. Registers the token with the backend
 * 
 * IMPORTANT: This is entirely optional and will NOT block the app or crash
 * if push notifications are unavailable or fail.
 */
export async function initializePushNotifications(): Promise<void> {
  console.log('[Push] Initializing push notifications...');
  
  try {
    // Get push token (handles permissions, device checks, etc.)
    const pushToken = await registerForPushNotificationsAsync();
    
    if (pushToken) {
      // Register with backend
      await registerPushTokenWithBackend(pushToken);
    } else {
      console.log('[Push] No push token obtained - notifications will not be available');
      console.log('[Push] This is normal on web, simulators, or if permissions denied');
    }
  } catch (error) {
    // Catch any unexpected errors - don't crash the app
    console.error('[Push] Failed to initialize push notifications:', error);
    console.log('[Push] App will continue without push notifications');
  }
}

/**
 * Add a listener for received notifications (when app is in foreground)
 */
export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
): Notifications.Subscription {
  return Notifications.addNotificationReceivedListener(callback);
}

/**
 * Add a listener for notification responses (when user taps notification)
 */
export function addNotificationResponseListener(
  callback: (response: Notifications.NotificationResponse) => void
): Notifications.Subscription {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

/**
 * Remove a notification listener
 * In newer Expo SDK versions, use subscription.remove() directly
 */
export function removeNotificationListener(subscription: Notifications.Subscription): void {
  if (subscription && typeof subscription.remove === 'function') {
    subscription.remove();
  }
}
