import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Alert, StyleSheet, View, Animated, Easing, Pressable, Platform, useWindowDimensions, Modal, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { LinearGradient } from 'expo-linear-gradient';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Button } from '@/components/ui/button';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from '@react-navigation/native';

export default function JournalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme] as any;
  const API = process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:8010';
  const { width: winW, height: winH } = useWindowDimensions();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const confirmScale = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.96)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

  // Entrance animations
  const entranceHeader = useRef(new Animated.Value(0)).current;
  const entranceContent = useRef(new Animated.Value(0)).current;
  const entranceActions = useRef(new Animated.Value(0)).current;

  const runEntrance = useCallback(() => {
    entranceHeader.setValue(0);
    entranceContent.setValue(0);
    entranceActions.setValue(0);
    Animated.stagger(70, [
      Animated.timing(entranceHeader, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(entranceContent, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(entranceActions, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  const makeFadeUp = (v: Animated.Value) => ({
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
  });

  useEffect(() => { runEntrance(); }, []);
  useFocusEffect(useCallback(() => { runEntrance(); return () => {}; }, []));

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

  // Format date as "Saturday, November 29, 2025"
  const when = useMemo(() => {
    if (!createdAt) return '';
    try {
      const d = new Date(createdAt);
      return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    } catch {
      return createdAt || '';
    }
  }, [createdAt]);

  // Entrance animation
  useEffect(() => {
    if (!loading) {
      Animated.parallel([
        Animated.spring(cardScale, { toValue: 1, useNativeDriver: true, tension: 60, friction: 12 }),
        Animated.timing(cardOpacity, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    }
  }, [loading]);

  const animateConfirm = useCallback((to: 0 | 1, done?: () => void) => {
    Animated.timing(confirmScale, {
      toValue: to,
      duration: to === 1 ? 220 : 180,
      easing: to === 1 ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(done);
  }, [confirmScale]);

  const closeConfirm = useCallback((after?: () => void) => {
    animateConfirm(0, () => {
      setShowDeleteConfirm(false);
      setIsDeleting(false);
      setDeleteError(null);
      after?.();
    });
  }, [animateConfirm]);

  const handleDeletePress = () => {
    if (Platform.OS !== 'web') {
      try { Haptics.selectionAsync(); } catch {}
    }
    setDeleteError(null);
    confirmScale.setValue(0);
    setShowDeleteConfirm(true);
    requestAnimationFrame(() => animateConfirm(1));
  };

  const handleConfirmDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const tok = await getAuthToken();
      if (!tok) {
        setIsDeleting(false);
        Alert.alert('Not signed in', 'Please sign in again.');
        return;
      }
      const res = await fetch(`${API}/api/journals/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.status === 401) {
        await clearAuthToken();
        closeConfirm(() => router.replace('/auth'));
        return;
      }
      if (res.status === 404) {
        closeConfirm(() => router.replace('/(student)/(tabs)/journal'));
        return;
      }
      if (!res.ok) {
        let detail = '';
        try { const d = await res.json(); detail = d?.detail || d?.message || ''; } catch {}
        throw new Error(detail || `Delete failed: ${res.status}`);
      }
      if (Platform.OS !== 'web') {
        try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      }
      // Use replace to ensure list refreshes on both web and mobile
      closeConfirm(() => router.replace('/(student)/(tabs)/journal'));
    } catch (e: any) {
      setDeleteError(e?.message || 'Unable to delete this journal entry. Please try again.');
      setIsDeleting(false);
    }
  };

  const handleCancelDelete = () => closeConfirm();

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#d1fae5', '#ecfdf5', '#ffffff']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.5 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Floating back button */}
      <Animated.View style={[styles.floatingHeader, makeFadeUp(entranceHeader)]}>
        <Pressable onPress={() => router.replace('/(student)/(tabs)/journal')} accessibilityRole="button" style={styles.floatingBtn} accessibilityLabel="Go back to journal list">
          <Icon name="arrow-left" size={20} color="#047857" />
        </Pressable>
      </Animated.View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <View style={styles.skeletonIcon} />
          <View style={[styles.skeletonLine, { width: '60%', height: 24, marginTop: 24 }]} />
          <View style={[styles.skeletonLine, { width: '40%', height: 14, marginTop: 8 }]} />
          <View style={[styles.skeletonLine, { width: '100%', marginTop: 32 }]} />
          <View style={[styles.skeletonLine, { width: '92%' }]} />
          <View style={[styles.skeletonLine, { width: '88%' }]} />
          <View style={[styles.skeletonLine, { width: '96%' }]} />
        </View>
      ) : error ? (
        <View style={styles.errorWrap}>
          <Icon name="book-open" size={48} color="#DC2626" />
          <ThemedText style={{ color: '#DC2626', marginTop: 12, textAlign: 'center' }}>{error}</ThemedText>
          <Button title="Go back" variant="outline" onPress={() => router.replace('/(student)/(tabs)/journal')} style={{ marginTop: 16 }} />
        </View>
      ) : (
        <Animated.View style={[styles.cardWrap, { opacity: cardOpacity, transform: [{ scale: cardScale }] }, makeFadeUp(entranceContent)]}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.cardContent}
          >
            {/* Icon badge */}
            <View style={styles.iconBadge}>
              <Icon name="book-open" size={28} color="#047857" />
            </View>

            {/* Title */}
            <ThemedText style={styles.cardTitle}>{title}</ThemedText>

            {/* Date subtitle */}
            {when ? (
              <ThemedText style={styles.cardDate}>{when}</ThemedText>
            ) : null}

            {/* Content body */}
            <ThemedText style={styles.cardBody}>{content}</ThemedText>
          </ScrollView>

          {/* Delete action button at bottom */}
          <Animated.View style={[styles.cardFooter, makeFadeUp(entranceActions)]}>
            <Pressable
              onPress={handleDeletePress}
              accessibilityRole="button"
              accessibilityLabel="Delete journal entry"
              style={({ pressed }) => [
                styles.deleteBtn,
                pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
              ]}
            >
              <Icon name="trash-2" size={18} color="#b91c1c" />
              <ThemedText style={styles.deleteBtnText}>Delete Entry</ThemedText>
            </Pressable>
          </Animated.View>
        </Animated.View>
      )}

      {/* Delete confirmation modal */}
      <Modal visible={showDeleteConfirm} transparent animationType="fade" onRequestClose={handleCancelDelete}>
        <View style={styles.overlay}>
          <Animated.View
            style={StyleSheet.flatten([
              styles.confirmCard,
              {
                transform: [
                  { scale: confirmScale.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
                  { translateY: confirmScale.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
                ],
                opacity: confirmScale,
              },
            ])}
          >
            <View style={styles.confirmIconWrap}>
              <Icon name="trash-2" size={28} color="#b91c1c" />
            </View>
            <ThemedText style={styles.confirmTitle}>Let this story go?</ThemedText>
            <ThemedText style={styles.confirmMessage}>
              Oh no, this is your journal! Deleting it will permanently remove this entry from your history.
            </ThemedText>
            {deleteError ? (
              <View style={[styles.noticeBox, { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }]}>
                <ThemedText style={{ color: '#B91C1C', fontSize: 13 }}>{deleteError}</ThemedText>
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <Button
                title="Keep it"
                variant="ghost"
                onPress={handleCancelDelete}
                disabled={isDeleting}
                style={{ flex: 1, paddingVertical: 12, backgroundColor: 'rgba(13,140,79,0.08)', borderWidth: 0 }}
                textStyle={{ fontSize: 14 }}
              />
              <Button
                title={isDeleting ? 'Deleting…' : 'Delete entry'}
                variant="ghost"
                onPress={handleConfirmDelete}
                loading={isDeleting}
                style={{ flex: 1, paddingVertical: 12, backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 0 }}
                textStyle={{ fontSize: 14, color: '#b91c1c' }}
              />
            </View>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  floatingHeader: {
    position: 'absolute',
    top: 56,
    left: 20,
    zIndex: 10,
  },
  floatingBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#064e3b',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  loadingWrap: {
    flex: 1,
    paddingTop: 120,
    paddingHorizontal: 32,
    alignItems: 'center',
    gap: 10,
  },
  skeletonIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  skeletonLine: {
    height: 16,
    borderRadius: 10,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    alignSelf: 'stretch',
  },
  errorWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  cardWrap: {
    flex: 1,
    marginTop: 116,
    marginHorizontal: 20,
    marginBottom: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 32,
    shadowColor: '#064e3b',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
    overflow: 'hidden',
  },
  cardContent: {
    paddingTop: 32,
    paddingHorizontal: 28,
    paddingBottom: 100,
    alignItems: 'center',
  },
  iconBadge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  cardTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 26,
    color: '#064e3b',
    textAlign: 'center',
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  cardDate: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: '#6b7280',
    marginTop: 8,
    textAlign: 'center',
  },
  cardBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    lineHeight: 26,
    color: '#374151',
    marginTop: 28,
    textAlign: 'left',
    alignSelf: 'stretch',
  },
  cardFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingVertical: 20,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  deleteBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: '#b91c1c',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  confirmCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 28,
    gap: 20,
    width: '100%',
    maxWidth: 360,
    shadowColor: '#0f172a',
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 14,
  },
  confirmIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  confirmTitle: {
    fontSize: 21,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
    color: '#111827',
    marginTop: 4,
  },
  confirmMessage: {
    fontSize: 15,
    textAlign: 'center',
    color: '#6b7280',
    marginHorizontal: 8,
    marginTop: -2,
  },
  noticeBox: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginTop: 8,
  },
});
