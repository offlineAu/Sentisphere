import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "sentisphere-mobile",
  slug: "sentisphere-mobile",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/Sentisphere Logo Only.png",
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
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png"
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
        image: "./assets/images/Sentisphere Logo Only.png",
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
        icon: "./assets/images/Sentisphere Logo Only.png",
        color: "#10B981",
        sounds: []
      }
    ]
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
