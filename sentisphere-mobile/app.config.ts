import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Sentisphere",
  slug: "sentisphere-mobile",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/sentisphere-logo.png",
  scheme: "sentispheremobile",
  userInterfaceStyle: "light",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.sentisphere.mobile",
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false
    }
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/images/sentisphere-logo.png",
      backgroundColor: "#ffffffff"
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: "com.sentisphere.mobile",
    googleServicesFile: "./google-services.json",
    softwareKeyboardLayoutMode: "pan"
  },
  androidStatusBar: {
    barStyle: "dark-content",
    backgroundColor: "#ffffff"
  },
  androidNavigationBar: {
    barStyle: "dark-content",
    backgroundColor: "#ffffff"
  },
  web: {
    output: "static",
    favicon: "./assets/images/favicon.png"
  },
  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      {
        image: "./assets/images/sentisphere-logo.png",
        imageWidth: 180,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
        dark: {
          backgroundColor: "#000000"
        }
      }
    ],
    "expo-font",
    "expo-web-browser",
    "expo-secure-store",
    [
      "expo-notifications",
      {
        icon: "./assets/images/sentisphere-logo.png",
        color: "#10B981",
        sounds: []
      }
    ],
    [
      "expo-build-properties",
      {
        android: {
          compileSdkVersion: 36,
          targetSdkVersion: 36,
          minSdkVersion: 24
        },
        ios: {
          deploymentTarget: "15.1"
        }
      }
    ],
    "./plugins/withFirebaseMessaging"
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true
  },
  extra: {
    eas: {
      projectId: "a1db9780-ce18-4502-a99b-c0679af493b9"
    },
    router: {},
    // Expose API URL from environment variable
    apiUrl: process.env.EXPO_PUBLIC_API_URL || "https://sentisphere-production.up.railway.app"
  },
  owner: "hyun00"
});
