import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, Animated, Easing, Pressable, Platform, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function JournalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme] as any;
  const API = process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:8010';
  const { width: winW } = useWindowDimensions();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [createdAt, setCreatedAt] = useState<string | null>(null);

  const getAuthToken = async (): Promise<string | null> => {
    if (Platform.OS === 'web') {
      try { return (window as any)?.localStorage?.getItem('auth_token') || null } catch { return null }
    }
    try { return await SecureStore.getItemAsync('auth_token') } catch { return null }
  };
  const clearAuthToken = async () => {
    if (Platform.OS === 'web') { try { (window as any)?.localStorage?.removeItem('auth_token') } catch {} ; return; }
    try { await SecureStore.deleteItemAsync('auth_token') } catch {}
  };

  const load = useRef(async () => {}).current;
  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const tok = await getAuthToken();
        if (!tok) { setError('Not signed in'); setLoading(false); return; }
        const res = await fetch(`${API}/api/journals/${id}`, { headers: { Authorization: `Bearer ${tok}` } });
        if (res.status === 401) {
          await clearAuthToken();
          router.replace('/auth');
          return;
        }
        if (res.status === 404) {
          setError('Not found');
          setLoading(false);
          return;
        }
        if (!res.ok) {
          setError('Failed to load');
          setLoading(false);
          return;
        }
        const d = await res.json();
        setContent(String(d?.content || ''));
        setCreatedAt(String(d?.created_at || ''));
      } catch {
        setError('Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const title = useMemo(() => {
    const first = content.trim().split(/\n+/)[0]?.trim() || 'Journal Entry';
    return first.slice(0, 80) || 'Journal Entry';
  }, [content]);

  const when = useMemo(() => {
    if (!createdAt) return '';
    try { return new Date(createdAt).toLocaleString(); } catch { return createdAt || ''; }
  }, [createdAt]);

  const scrollY = useRef(new Animated.Value(0)).current;
  const ease = Easing.bezier(0.22, 1, 0.36, 1);
  const headerH = scrollY.interpolate({ inputRange: [0, 140], outputRange: [170, 88], extrapolate: 'clamp' });
  const titleSize = scrollY.interpolate({ inputRange: [0, 140], outputRange: [22, 16], extrapolate: 'clamp' });
  const titleTx = scrollY.interpolate({ inputRange: [0, 140], outputRange: [0, -6], extrapolate: 'clamp' });

  const [contentH, setContentH] = useState(1);
  const [viewH, setViewH] = useState(1);
  const [progress, setProgress] = useState(0);

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.progressTrack, { backgroundColor: '#EEF2F7' }]}> 
        <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: '#10B981' }]} />
      </View>

      <Animated.View style={[styles.header, { height: headerH }]}> 
        <LinearGradient colors={["#ECFDF5", "#D1FAE5"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
        <View style={styles.headerBar}>
          <Pressable onPress={() => router.back()} accessibilityRole="button" style={styles.backBtn}>
            <Icon name="arrow-left" size={18} color="#065F46" />
          </Pressable>
          <ThemedText style={{ color: '#065F46', fontFamily: 'Inter_600SemiBold' }}>Journal</ThemedText>
          <View style={{ width: 40 }} />
        </View>
        <Animated.Text
          numberOfLines={2}
          style={{
            fontFamily: 'Inter_700Bold',
            color: '#065F46',
            fontSize: titleSize as any,
            transform: [{ translateY: titleTx as any }],
            paddingHorizontal: 16,
            textAlign: 'left',
          }}
        >
          {title}
        </Animated.Text>
        <ThemedText style={{ color: '#047857', paddingHorizontal: 16, marginTop: 4 }}>{when}</ThemedText>
      </Animated.View>

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        onLayout={(e) => setViewH(e.nativeEvent.layout.height)}
        onContentSizeChange={(_, h) => setContentH(h)}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          {
            useNativeDriver: true,
            listener: (e: any) => {
              const y = e.nativeEvent.contentOffset?.y || 0;
              const total = Math.max(1, contentH - viewH);
              setProgress(Math.min(1, Math.max(0, y / total)));
            },
          }
        )}
        scrollEventThrottle={16}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      >
        {loading ? (
          <View style={{ paddingTop: 24 }}>
            <View style={{ height: 18, backgroundColor: '#F3F4F6', borderRadius: 6, marginBottom: 10 }} />
            <View style={{ height: 14, backgroundColor: '#F3F4F6', borderRadius: 6, marginBottom: 8, width: '92%' }} />
            <View style={{ height: 14, backgroundColor: '#F3F4F6', borderRadius: 6, marginBottom: 8, width: '88%' }} />
            <View style={{ height: 14, backgroundColor: '#F3F4F6', borderRadius: 6, marginBottom: 8, width: '96%' }} />
          </View>
        ) : error ? (
          <ThemedText style={{ color: '#DC2626' }}>{error}</ThemedText>
        ) : (
          <View style={styles.paper}>
            <ThemedText style={styles.contentText}>{content}</ThemedText>
          </View>
        )}
      </Animated.ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  progressTrack: { height: 2, width: '100%' },
  progressFill: { height: 2 },
  header: { paddingTop: 14, justifyContent: 'flex-start', gap: 6 },
  headerBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, marginBottom: 2 },
  backBtn: { width: 40, height: 32, alignItems: 'flex-start', justifyContent: 'center' },
  paper: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', padding: 16 },
  contentText: { fontSize: 16, lineHeight: 24, color: '#111827' },
});
