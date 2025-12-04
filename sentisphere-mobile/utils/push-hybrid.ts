/**
 * Hybrid Push Notification Module
 * 
 * Platform-specific push notification handling:
 * - Android → Pusher Beams
 * - iOS → Expo Push Notifications (unchanged)
 */

import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Beams from "@threls/expo-pusher-beams";

const INSTANCE_ID = process.env.EXPO_PUBLIC_PUSHER_INSTANCE_ID ?? "";
const API = process.env.EXPO_PUBLIC_API_URL || "https://sentisphere-production.up.railway.app";

/**
 * Initialize platform-specific push notifications after user authentication.
 * 
 * @param userId - The authenticated user's ID
 */
export async function initializePush(userId: string | number) {
  if (Platform.OS === "android") {
    // ANDROID → PUSHER BEAMS
    console.log("[Push] Initializing Pusher for Android");

    try {
      // Initialize Pusher Beams with instance ID
      await Beams.setInstanceId(INSTANCE_ID);
      
      // Get auth token from backend
      const resp = await fetch(`${API}/pusher/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId })
      });
      const data = await resp.json();
      
      // Set user ID with the token from backend
      await Beams.setUserId(String(userId), data.token);
      console.log("[Push] ✓ Pusher Beams initialized for Android user:", userId);
    } catch (error) {
      console.error("[Push] ✗ Pusher Beams initialization failed:", error);
    }

  } else if (Platform.OS === "ios") {
    // IOS → EXPO PUSH NOTIFICATIONS (existing behavior)
    console.log("[Push] Initializing Expo Push for iOS");

    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== "granted") {
        console.log("[Push] iOS permission not granted");
        return;
      }

      const token = (await Notifications.getExpoPushTokenAsync()).data;
      console.log("[Push] iOS Expo token obtained:", token.substring(0, 30) + "...");

      await fetch(`${API}/api/push-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          push_token: token,
          platform: "ios"
        })
      });
      console.log("[Push] ✓ iOS Expo token registered with backend");
    } catch (error) {
      console.error("[Push] ✗ iOS Expo push initialization failed:", error);
    }
  } else {
    console.log("[Push] Platform not supported for push notifications:", Platform.OS);
  }
}

/**
 * Cleanup push notification state on logout.
 * Platform-specific cleanup ensures no stale registrations remain.
 */
export async function logoutPush() {
  if (Platform.OS === "android") {
    console.log("[Push] Clearing Pusher Beams state");
    try {
      await Beams.stop();
      await Beams.clearAllState();
      console.log("[Push] ✓ Pusher Beams state cleared");
    } catch (error) {
      console.error("[Push] ✗ Failed to clear Pusher Beams state:", error);
    }
  } else if (Platform.OS === "ios") {
    console.log("[Push] Deleting iOS Expo push token");
    try {
      await fetch(`${API}/api/push-token`, {
        method: "DELETE"
      });
      console.log("[Push] ✓ iOS push token unregistered from backend");
    } catch (error) {
      console.error("[Push] ✗ Failed to unregister iOS push token:", error);
    }
  }
}
