import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import './global.css';

import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { View, Image, Platform, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useEffect } from 'react';
import { Colors } from '@/constants/theme';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';

// Define styles BEFORE component to ensure they're available
const loadingStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  logoWrapper: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 100,
    height: 100,
    resizeMode: 'contain',
  },
});

// Note: No anchor setting here - let index.tsx be the initial route for onboarding flow

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Fallback for web to ensure white background regardless of browser/system prefs
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const rootEls = [document.documentElement, document.body, document.getElementById('root'), document.getElementById('app')].filter(Boolean) as HTMLElement[];
      rootEls.forEach((el) => {
        el.style.backgroundColor = '#ffffff';
        el.style.color = '#000000';
      });
    }
  }, []);

  // Smooth pulse animation for loading state
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.6);

  useEffect(() => {
    if (!fontsLoaded) {
      pulseScale.value = withRepeat(
        withTiming(1.08, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
      pulseOpacity.value = withRepeat(
        withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    }
  }, [fontsLoaded]);

  const logoAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  if (!fontsLoaded) {
    return (
      <View style={loadingStyles.container}>
        <Animated.View style={[loadingStyles.logoWrapper, logoAnimatedStyle]}>
          <Image
            source={require('@/assets/images/sentisphere-logo.png')}
            style={loadingStyles.logo}
          />
        </Animated.View>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider
        value={{
          ...DefaultTheme,
          dark: false,
          colors: {
            ...DefaultTheme.colors,
            background: Colors.light.background, // scene background
            card: Colors.light.background,       // header/tab bar background
            text: Colors.light.text,
            border: Colors.light.border,
            primary: Colors.light.tint,
          },
        }}
      >
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.light.background } }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding/terms" options={{ headerShown: false, animation: 'fade' }} />
          <Stack.Screen name="(student)" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
          <Stack.Screen name="auth/index" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', headerShown: false }} />
        </Stack>
        <StatusBar style="dark" />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
