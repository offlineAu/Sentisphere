const { withAndroidManifest } = require("expo/config-plugins");

/**
 * Expo config plugin to add Firebase Messaging service declarations
 * to AndroidManifest.xml for push notification support.
 */
function withFirebaseMessaging(config) {
  return withAndroidManifest(config, async (config) => {
    const manifest = config.modResults;
    const application = manifest.manifest.application?.[0];

    if (!application) {
      console.warn("withFirebaseMessaging: No application tag found in AndroidManifest.xml");
      return config;
    }

    // Initialize service array if it doesn't exist
    if (!application.service) {
      application.service = [];
    }

    // Check if services already exist to avoid duplicates
    const hasFirebaseService = application.service.some(
      (s) => s.$?.["android:name"] === "com.google.firebase.messaging.FirebaseMessagingService"
    );
    const hasExpoService = application.service.some(
      (s) => s.$?.["android:name"] === "expo.modules.notifications.service.ExpoFirebaseMessagingService"
    );

    // Add Firebase Messaging Service
    if (!hasFirebaseService) {
      application.service.push({
        $: {
          "android:name": "com.google.firebase.messaging.FirebaseMessagingService",
          "android:exported": "false",
        },
        "intent-filter": [
          {
            action: [{ $: { "android:name": "com.google.firebase.MESSAGING_EVENT" } }],
          },
        ],
      });
    }

    // Add Expo Firebase Messaging Service
    if (!hasExpoService) {
      application.service.push({
        $: {
          "android:name": "expo.modules.notifications.service.ExpoFirebaseMessagingService",
          "android:exported": "false",
        },
        "intent-filter": [
          {
            action: [{ $: { "android:name": "com.google.firebase.MESSAGING_EVENT" } }],
          },
        ],
      });
    }

    return config;
  });
}

module.exports = withFirebaseMessaging;
