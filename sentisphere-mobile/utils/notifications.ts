/**
 * Push Notification Manager for Expo SDK 51+
 * 
 * ARCHITECTURE:
 * - Single source of truth for notification handlers and listeners
 * - Module-level singleton listeners (exactly ONE set)
 * - SecureStore-based caching to prevent duplicate backend POSTs
 * 
 * HYBRID PUSH SYSTEM:
 * - Android: Uses Pusher Beams (handled by push-hybrid.ts)
 * - iOS: Uses Expo Push Notifications (handled here and in push-hybrid.ts)
 * 
 * USAGE:
 * - Call setupGlobalNotificationListeners() to attach listeners
 * - Call cleanupGlobalNotificationListeners() on logout
 * - For push token registration, use push-hybrid.ts instead
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const API = process.env.EXPO_PUBLIC_API_URL || 'https://sentisphere-production.up.railway.app';

// ============================================================================
// STORAGE KEYS
// ============================================================================
const STORAGE_KEYS = {
  LAST_PUSH_TOKEN: 'push_last_token',
  LAST_PUSH_USER_ID: 'push_last_user_id',
  AUTH_TOKEN: 'auth_token',
};

// ============================================================================
// MODULE-LEVEL STATE (Singleton pattern for listeners)
// ============================================================================
let notificationReceivedSubscription: Notifications.Subscription | null = null;
let notificationResponseSubscription: Notifications.Subscription | null = null;
let listenersActive = false;

// ============================================================================
// NOTIFICATION HANDLER (Configure once at module load)
// ============================================================================
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ============================================================================
// STORAGE HELPERS
// ============================================================================
async function getStoredValue(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return window.localStorage?.getItem(key) || null;
    } catch {
      return null;
    }
  }
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function setStoredValue(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      window.localStorage?.setItem(key, value);
    } catch {}
    return;
  }
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {}
}

async function deleteStoredValue(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      window.localStorage?.removeItem(key);
    } catch {}
    return;
  }
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {}
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Request notification permissions and get the Expo push token.
 * Internal function - handles all platform-specific logic.
 * 
 * NOTE: For iOS remote push registration, use push-hybrid.ts instead.
 * This function is kept for backward compatibility and local notification setup.
 */
async function getExpoPushToken(): Promise<string | null> {
  // Setup Android notification channel (still needed for Pusher Beams notifications)
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    } catch (error) {
      console.warn('[Push] Failed to setup Android channel:', error);
    }
    // Android uses Pusher Beams - skip Expo token generation
    console.log('[Push] Android uses Pusher Beams - skipping Expo token generation');
    return null;
  }

  // Check device compatibility
  if (Constants.appOwnership === 'expo') {
    console.log('[Push] Expo Go detected - build with dev client or standalone APK for push tokens');
    return null;
  }

  if (Platform.OS === 'web') {
    console.log('[Push] Web platform - push tokens not supported');
    return null;
  }

  // iOS only from here
  try {
    // Check/request permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[Push] Permission not granted');
      return null;
    }

    // Get project ID
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.error('[Push] Missing EAS projectId in app config');
      return null;
    }

    // Get token
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    console.log('[Push] ✓ iOS Token obtained:', tokenData.data.substring(0, 30) + '...');
    return tokenData.data;
  } catch (error) {
    console.error('[Push] Failed to get iOS token:', error);
    return null;
  }
}

/**
 * Register push token with backend.
 * Internal function - posts token to API.
 */
async function postTokenToBackend(pushToken: string): Promise<boolean> {
  try {
    const authToken = await getStoredValue(STORAGE_KEYS.AUTH_TOKEN);
    if (!authToken) {
      console.log('[Push] No auth token - cannot register push token');
      return false;
    }

    console.log('[Push] 📤 POST /api/push-token');
    const response = await fetch(`${API}/api/push-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ push_token: pushToken }),
    });

    if (response.ok) {
      console.log('[Push] ✓ Token registered with backend');
      return true;
    } else {
      console.error('[Push] ✗ Backend registration failed:', response.status);
      return false;
    }
  } catch (error) {
    console.error('[Push] ✗ Backend registration error:', error);
    return false;
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Initialize push notifications for a user.
 * 
 * DEPRECATED: Use initializePush from push-hybrid.ts instead.
 * This function is kept for backward compatibility.
 * 
 * For the hybrid push system:
 * - Android: Pusher Beams (handled by push-hybrid.ts)
 * - iOS: Expo Push (handled by push-hybrid.ts)
 * 
 * @param userId - The authenticated user's ID (string)
 */
export async function initializePushNotifications(userId: string): Promise<void> {
  console.log('[Push] initializePushNotifications called for userId:', userId);
  console.log('[Push] ⚠️ DEPRECATED: Use initializePush from push-hybrid.ts instead');

  if (Platform.OS === 'web') {
    console.log('[Push] Skipping - web platform');
    return;
  }

  // Android now uses Pusher Beams - skip Expo token registration
  if (Platform.OS === 'android') {
    console.log('[Push] Android uses Pusher Beams - skipping Expo token registration');
    // Still setup notification channel for receiving Pusher notifications
    await getExpoPushToken();
    return;
  }

  // iOS: Continue with Expo push token registration (backward compatibility)
  // Note: push-hybrid.ts is the preferred method for iOS as well
  try {
    const currentToken = await getExpoPushToken();
    if (!currentToken) {
      console.log('[Push] No token obtained - skipping registration');
      return;
    }

    const lastToken = await getStoredValue(STORAGE_KEYS.LAST_PUSH_TOKEN);
    const lastUserId = await getStoredValue(STORAGE_KEYS.LAST_PUSH_USER_ID);

    const tokenChanged = lastToken !== currentToken;
    const userChanged = lastUserId !== userId;

    if (!tokenChanged && !userChanged) {
      console.log('[Push] ⏭️ Cached match found - skipping backend POST');
      return;
    }

    console.log('[Push] 🔄 Change detected, POSTing to backend');
    const success = await postTokenToBackend(currentToken);

    if (success) {
      await setStoredValue(STORAGE_KEYS.LAST_PUSH_TOKEN, currentToken);
      await setStoredValue(STORAGE_KEYS.LAST_PUSH_USER_ID, userId);
      console.log('[Push] ✓ Cached token and userId for future deduplication');
    }
  } catch (error) {
    console.error('[Push] initializePushNotifications error:', error);
  }
}

/**
 * Setup global notification listeners.
 * 
 * SINGLETON: Only ONE set of listeners will ever be active.
 * - If already active, returns immediately
 * - Stores subscriptions in module-level variables
 * 
 * Call this ONCE after initializePushNotifications.
 */
export function setupGlobalNotificationListeners(): void {
  // Guard: Only one set of listeners ever
  if (listenersActive) {
    console.log('[Push] Global notification listeners already active - skipping');
    return;
  }

  console.log('[Push] Setting up global notification listeners...');

  // Listener for notifications received while app is in foreground
  notificationReceivedSubscription = Notifications.addNotificationReceivedListener(
    (notification) => {
      console.log('[Notification] Received:', notification.request.content.title);
    }
  );

  // Listener for when user taps on a notification
  notificationResponseSubscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      console.log('[Notification] Tapped:', response.notification.request.content.title);
      const data = response.notification.request.content.data;
      if (data?.category) {
        console.log('[Notification] Category:', data.category);
      }
    }
  );

  listenersActive = true;
  console.log('[Push] ✓ Global notification listeners initialized');
}

/**
 * Cleanup global notification listeners.
 * 
 * Call this on logout to remove all listeners.
 * Safe to call multiple times.
 */
export function cleanupGlobalNotificationListeners(): void {
  console.log('[Push] Cleaning up global notification listeners...');

  if (notificationReceivedSubscription) {
    notificationReceivedSubscription.remove();
    notificationReceivedSubscription = null;
  }

  if (notificationResponseSubscription) {
    notificationResponseSubscription.remove();
    notificationResponseSubscription = null;
  }

  listenersActive = false;
  console.log('[Push] ✓ Global notification listeners cleaned up');
}

/**
 * Unregister push token from backend and clear cached state.
 * 
 * Call this on logout BEFORE clearing auth token.
 */
export async function unregisterPushToken(): Promise<void> {
  console.log('[Push] Unregistering push token...');

  try {
    const authToken = await getStoredValue(STORAGE_KEYS.AUTH_TOKEN);
    if (authToken) {
      await fetch(`${API}/api/push-token`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      console.log('[Push] ✓ Token unregistered from backend');
    }
  } catch (error) {
    console.error('[Push] Unregister error:', error);
  }

  // Clear cached state
  await deleteStoredValue(STORAGE_KEYS.LAST_PUSH_TOKEN);
  await deleteStoredValue(STORAGE_KEYS.LAST_PUSH_USER_ID);
  console.log('[Push] ✓ Cached push state cleared');
}

/**
 * Full cleanup for logout.
 * 
 * Convenience function that:
 * 1. Unregisters token from backend
 * 2. Clears cached state
 * 3. Removes notification listeners
 */
export async function cleanupOnLogout(): Promise<void> {
  console.log('[Push] === LOGOUT CLEANUP START ===');
  await unregisterPushToken();
  cleanupGlobalNotificationListeners();
  console.log('[Push] === LOGOUT CLEANUP COMPLETE ===');
}
