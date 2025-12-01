/**
 * Push Notification utilities for Expo
 * Handles permission requests, token registration, and notification handling
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const API = process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:8010';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
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
 * Request notification permissions and get the Expo push token
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  // Push notifications only work on physical devices
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  // Web doesn't support Expo push notifications
  if (Platform.OS === 'web') {
    console.log('Push notifications not supported on web');
    return null;
  }

  try {
    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permission if not granted
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Push notification permission not granted');
      return null;
    }

    // Get the Expo push token
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    const token = tokenData.data;
    console.log('Expo push token:', token);

    // Configure Android notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#10B981',
      });
    }

    return token;
  } catch (error) {
    console.error('Failed to get push token:', error);
    return null;
  }
}

/**
 * Register the push token with the backend
 */
export async function registerPushTokenWithBackend(pushToken: string): Promise<boolean> {
  try {
    const authToken = await getAuthToken();
    if (!authToken) {
      console.log('No auth token, skipping push token registration');
      return false;
    }

    const response = await fetch(`${API}/api/push-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ push_token: pushToken }),
    });

    if (response.ok) {
      console.log('Push token registered with backend');
      return true;
    } else {
      console.error('Failed to register push token:', response.status);
      return false;
    }
  } catch (error) {
    console.error('Failed to register push token with backend:', error);
    return false;
  }
}

/**
 * Unregister push token from backend (e.g., on logout)
 */
export async function unregisterPushToken(): Promise<boolean> {
  try {
    const authToken = await getAuthToken();
    if (!authToken) {
      return true; // No token to unregister
    }

    const response = await fetch(`${API}/api/push-token`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    return response.ok;
  } catch (error) {
    console.error('Failed to unregister push token:', error);
    return false;
  }
}

/**
 * Initialize push notifications - call this on app startup after login
 */
export async function initializePushNotifications(): Promise<void> {
  try {
    const pushToken = await registerForPushNotificationsAsync();
    if (pushToken) {
      await registerPushTokenWithBackend(pushToken);
    }
  } catch (error) {
    console.error('Failed to initialize push notifications:', error);
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
 */
export function removeNotificationListener(subscription: Notifications.Subscription): void {
  Notifications.removeNotificationSubscription(subscription);
}
