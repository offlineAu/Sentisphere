import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import './global.css';

import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { View, ActivityIndicator, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useEffect } from 'react';
import { Colors } from '@/constants/theme';

export const unstable_settings = {
  anchor: '(student)',
};

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

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
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
        <Stack screenOptions={{ contentStyle: { backgroundColor: Colors.light.background } }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(student)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <StatusBar style="dark" />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
