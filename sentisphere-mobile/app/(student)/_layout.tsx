import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Stack, useRouter } from 'expo-router';

export default function StudentLayout() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);

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
