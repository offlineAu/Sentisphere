import { useEffect, useRef } from 'react';
import { StyleSheet, View, Animated, Easing, Platform, Image, Pressable } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { LinearGradient } from 'expo-linear-gradient';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';

export default function LogoutScreen() {
  // Match success overlays: fade + scale in (0.96 -> 1) with cubic timing
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);

  const doLogout = async () => {
    try {
      if (Platform.OS === 'web') {
        try { (window as any)?.localStorage?.removeItem('auth_token'); } catch {}
      } else {
        try { await SecureStore.deleteItemAsync('auth_token'); } catch {}
      }
    } finally {
      router.replace('/auth');
    }
  };

  return (
    <ThemedView style={styles.container}>
      <LinearGradient colors={["#FFFFFF", "#FEE2E2"]} style={StyleSheet.absoluteFillObject} />
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Back" style={styles.backBtn}>
          <Icon name="arrow-left" size={18} color="#991B1B" />
        </Pressable>
      </View>
      <Animated.View style={{ alignItems: 'center', gap: 8, opacity: anim, transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] }}>
        <Image source={require('../assets/images/leaving.png')} style={{ width: 120, height: 120 }} accessibilityLabel="Leaving" />
        <ThemedText style={styles.title}>You're leaving already?</ThemedText>
        <ThemedText style={styles.subtitle}>You can always come back anytime. We’ll keep your data safe.</ThemedText>
      </Animated.View>
      <View style={styles.bottom}>
        <Button title="Logout" onPress={doLogout} style={styles.logoutBtn} textStyle={{ fontSize: 14, color: '#FFFFFF' }} />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', padding: 24 },
  topBar: { position: 'absolute', top: 16, left: 16, right: 16, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  backBtn: { width: 40, height: 32, alignItems: 'flex-start', justifyContent: 'center' },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold', color: '#111827', marginTop: 6 },
  subtitle: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginHorizontal: 24 },
  bottom: { position: 'absolute', left: 16, right: 16, bottom: 24 },
  logoutBtn: { paddingVertical: 14, borderRadius: 999, alignSelf: 'stretch', backgroundColor: '#DC2626' },
});
