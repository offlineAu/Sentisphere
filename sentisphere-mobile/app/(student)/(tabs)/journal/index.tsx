import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { Animated, Easing, Pressable, StyleSheet, TextInput, View, Keyboard, Alert, TouchableWithoutFeedback, KeyboardAvoidingView, ScrollView, Platform, Modal, useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Link, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as SecureStore from 'expo-secure-store';
import { getDeletedJournalIds, addDeletedJournalId } from '@/utils/soft-delete';

const JournalListIcon = require('@/assets/images/journal list.png');


type Entry = { id: string; title: string; body: string; date: string };

export default function JournalListScreen() {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme] as any;
  const { height: winH, width: winW } = useWindowDimensions();
  const API = process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:8010';
  const router = useRouter();

  // Tabs: 0 = Write Entry, 1 = My Entries
  const [tab, setTab] = useState<0 | 1>(0);
  const [segW, setSegW] = useState(0);
  const animTab = useRef(new Animated.Value(0)).current;
  // Track currently open swipe row so only one stays open
  const openSwipeRef = useRef<Swipeable | null>(null);
  const fetchEntriesRef = useRef<(() => void) | null>(null);
  const onTabChange = (next: 0 | 1) => {
    setTab(next);
    if (Platform.OS !== 'web') {
      try { Haptics.selectionAsync(); } catch {}
    }
    Animated.timing(animTab, {
      toValue: next,
      duration: 260,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: true,
    }).start();
  };


  // Voice dictation (web) via Web Speech API. Mobile: placeholder alert.
  const recognitionRef = useRef<any>(null);
  const [isListening, setIsListening] = useState(false);
  const handleVoicePress = () => {
    if (Platform.OS !== 'web') {
      Alert.alert('Voice input', 'Voice dictation is coming soon on mobile.');
      return;
    }
    const w: any = typeof window !== 'undefined' ? window : null;
    const SR = w && (w.SpeechRecognition || w.webkitSpeechRecognition);
    if (!SR) {
      Alert.alert('Not supported', 'This browser does not support Speech Recognition. Try Chrome.');
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop?.();
      return;
    }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.onresult = (event: any) => {
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) finalText += res[0]?.transcript ?? '';
      }
      if (finalText) {
        setBody((prev) => {
          const sep = prev && !prev.endsWith(' ') ? ' ' : '';
          return (prev ?? '') + sep + finalText.trim();
        });
      }
    };
    rec.onerror = () => setIsListening(false);
    rec.onend = () => setIsListening(false);
    try {
      rec.start();
      recognitionRef.current = rec;
      setIsListening(true);
    } catch {
      setIsListening(false);
    }
  };

  // Screen entrance animation (staggered fade + rise) - consistent with dashboard
  const entranceHeader = useRef(new Animated.Value(0)).current;
  const entranceTabs = useRef(new Animated.Value(0)).current;
  const entranceContent = useRef(new Animated.Value(0)).current;
  const runScreenEntrance = () => {
    entranceHeader.setValue(0);
    entranceTabs.setValue(0);
    entranceContent.setValue(0);
    Animated.stagger(70, [
      Animated.timing(entranceHeader, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(entranceTabs, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(entranceContent, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  };
  const makeFadeUp = (v: Animated.Value) => ({
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
  });

  // Close any open swipe row on focus/blur to reset UI when navigating back
  useFocusEffect(
    useCallback(() => {
      // on focus - run entrance animation
      openSwipeRef.current?.close();
      runScreenEntrance();
      if (tab === 1) {
        fetchEntriesRef.current?.();
      }
      return () => {
        // on blur
        openSwipeRef.current?.close();
      };
    }, [tab])
  );

  // Editor state
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [titleFocused, setTitleFocused] = useState(false);
  const [bodyFocused, setBodyFocused] = useState(false);
  const wordCount = useMemo(() => (body.trim() ? body.trim().split(/\s+/).length : 0), [body]);
  const charCount = body.length;
  const [isSaving, setIsSaving] = useState(false);
  const [loadingEntries, setLoadingEntries] = useState(false);
  // Saved toast animation
  const toast = useRef(new Animated.Value(0)).current; // 0 hidden, 1 visible
  const showSavedToast = () => {
    Animated.timing(toast, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
      setTimeout(() => {
        Animated.timing(toast, { toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      }, 1200);
    });
  };

  const getAuthToken = async (): Promise<string | null> => {
    if (Platform.OS === 'web') {
      try { return (window as any)?.localStorage?.getItem('auth_token') || null } catch { return null }
    }
    try { return await SecureStore.getItemAsync('auth_token') } catch { return null }
  };

  const clearAuthToken = async () => {
    if (Platform.OS === 'web') {
      try { (window as any)?.localStorage?.removeItem('auth_token') } catch {}
      return;
    }
    try { await SecureStore.deleteItemAsync('auth_token') } catch {}
  };

  const [entries, setEntries] = useState<Entry[]>([]);
  const [pendingDelete, setPendingDelete] = useState<Entry | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const pendingDeleteScale = useRef(new Animated.Value(0)).current;

  const animateDeleteSheet = useCallback((to: 0 | 1, done?: () => void) => {
    Animated.timing(pendingDeleteScale, {
      toValue: to,
      duration: to === 1 ? 220 : 180,
      easing: to === 1 ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(done);
  }, [pendingDeleteScale]);

  const handleRequestDelete = (entry: Entry) => {
    openSwipeRef.current?.close?.();
    openSwipeRef.current = null;
    setDeleteError(null);
    if (Platform.OS !== 'web') {
      try { Haptics.selectionAsync(); } catch {}
    }
    setPendingDelete(entry);
    animateDeleteSheet(1);
  };

  const clearDeleteState = useCallback(() => {
    setPendingDelete(null);
    setIsDeleting(false);
    setDeleteError(null);
  }, []);

  const handleCancelDelete = () => {
    if (!pendingDelete) return;
    animateDeleteSheet(0, clearDeleteState);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete || isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      // Soft delete - only store the ID locally, don't call backend
      // This keeps the data in backend for analytics purposes
      await addDeletedJournalId(pendingDelete.id);
      
      // Remove from UI immediately
      setEntries((prev) => prev.filter((it) => it.id !== pendingDelete.id));
      
      if (Platform.OS !== 'web') {
        try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      }
      animateDeleteSheet(0, clearDeleteState);
    } catch (e: any) {
      setDeleteError(e?.message || 'Unable to delete this entry. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const fetchEntries = useCallback(async () => {
    try {
      setLoadingEntries(true);
      const tok = await getAuthToken();
      if (!tok) { setLoadingEntries(false); return; }
      const res = await fetch(`${API}/api/journals`, { headers: { Authorization: `Bearer ${tok}` } });
      if (!res.ok) { setLoadingEntries(false); return; }
      const arr = await res.json();
      
      // Get soft-deleted IDs to filter them out
      const deletedIds = await getDeletedJournalIds();
      
      const mapped: Entry[] = (arr || [])
        .filter((r: any) => !deletedIds.has(String(r?.journal_id)))
        .map((r: any) => {
          const content = String(r?.content || '');
          const firstLine = content.trim().split(/\n+/)[0]?.trim() || '';
          const title = firstLine.slice(0, 60) || 'Journal Entry';
          const body = content.slice(0, 160);
          const date = (r?.created_at || '').slice(0, 10) || '';
          return { id: String(r?.journal_id), title, body, date };
        });
      setEntries(mapped);
    } catch {
    } finally {
      setLoadingEntries(false);
    }
  }, [API]);

  useEffect(() => {
    fetchEntriesRef.current = fetchEntries;
  }, [fetchEntries]);

  useEffect(() => { fetchEntries(); }, []);
  useEffect(() => { if (tab === 1) fetchEntries(); }, [tab, fetchEntries]);

  // Segmented indicator translate
  const indicatorStyle = (() => {
    // Account for 8px inner padding (4 left + 4 right) to avoid right-edge overlap
    const usable = Math.max(0, segW - 8);
    const itemW = usable > 0 ? usable / 2 : 0;
    const tx = animTab.interpolate({ inputRange: [0, 1], outputRange: [0, itemW] });
    // Hide until measured to avoid initial overlap flash
    const opacity = segW > 0 ? 1 : 0;
    return { width: Math.max(0, itemW - 0.5), transform: [{ translateX: tx }], opacity };
  })();

  // Subtle entrance animation on tab change (for both Write and Entries content)
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const contentTranslateY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    contentOpacity.setValue(0);
    contentTranslateY.setValue(8);
    Animated.parallel([
      Animated.timing(contentOpacity, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(contentTranslateY, { toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [tab]);

  // Active border color per-field
  const focusGreen = '#0D8C4F';
  const focusGreenSubtle = '#0D8C4F15'; // subtle background

  // Save handler (POST to backend)
  const handleSave = async () => {
    if (isSaving) return;
    const text = body.trim();
    if (!title.trim()) {
      Alert.alert('Add a title', 'Please add a title for your journal entry before saving.');
      return;
    }
    if (!text) return;
    if (Platform.OS !== 'web') {
      try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    }
    setIsSaving(true);
    try {
      const tok = await getAuthToken();
      if (!tok) {
        setIsSaving(false);
        Alert.alert('Not signed in', 'Please sign in again.');
        return;
      }
      const res = await fetch(`${API}/api/journals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ content: text }),
      });
      if (res.status === 401) {
        await clearAuthToken();
        Alert.alert('Session expired', 'Please sign in again to continue.', [
          { text: 'OK', onPress: () => router.replace('/auth') }
        ]);
        return;
      }
      if (!res.ok) {
        let detail = '';
        try { const d = await res.json(); detail = d?.detail || d?.message || '' } catch {}
        throw new Error(detail || `Save failed: ${res.status}`);
      }
      const d = await res.json();
      const newEntry: Entry = {
        id: String(d?.journal_id ?? Date.now()),
        title: title.trim(),
        body: text,
        date: new Date().toISOString().slice(0, 10),
      };
      setEntries((prev) => [newEntry, ...prev]);
      setBody('');
      setTitle('');
      onTabChange(1);
      showSavedToast();
      if (Platform.OS !== 'web') {
        try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      }
    } catch (e: any) {
      Alert.alert('Save failed', e?.message || 'Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 24, paddingTop: 20, paddingBottom: 120, backgroundColor: scheme === 'dark' ? palette.background : '#FAFBFC' }}
        >
          <Animated.View style={makeFadeUp(entranceHeader)}>
            <View style={{ height: 24 }} />
            <ThemedText type="title">Journal</ThemedText>
            <ThemedText style={{ color: palette.muted, marginTop: 6 }}>Express your thoughts and track your emotional journey</ThemedText>
          </Animated.View>

          {/* Segmented control */}
          <Animated.View style={makeFadeUp(entranceTabs)}>
            <View
              style={[styles.segment, { backgroundColor: scheme === 'dark' ? '#1F2937' : '#EEF2F7', borderColor: palette.border, marginTop: 24 }]}
              onLayout={(e) => setSegW(e.nativeEvent.layout.width)}
            >
              {Platform.OS !== 'web' && (
                <Animated.View pointerEvents="none" style={[styles.segmentIndicator, { backgroundColor: '#ffffff' }, indicatorStyle]} />
              )}
              <Pressable 
                style={[
                  styles.segmentItem, 
                  Platform.OS === 'web' && tab === 0 && styles.segmentItemActiveWeb
                ]} 
                onPress={() => onTabChange(0)} 
                accessibilityRole="button" 
                accessibilityState={tab === 0 ? { selected: true } : {}}
              >
                <Feather name="edit-3" size={16} color={tab === 0 ? '#111827' : '#6B7280'} />
                <ThemedText style={[styles.segmentText, { color: tab === 0 ? '#111827' : '#6B7280' }]}>Write Entry</ThemedText>
              </Pressable>
              <Pressable 
                style={[
                  styles.segmentItem,
                  Platform.OS === 'web' && tab === 1 && styles.segmentItemActiveWeb
                ]} 
                onPress={() => onTabChange(1)} 
                accessibilityRole="button" 
                accessibilityState={tab === 1 ? { selected: true } : {}}
              >
                <Feather name="book-open" size={16} color={tab === 1 ? '#111827' : '#6B7280'} />
                <ThemedText style={[styles.segmentText, { color: tab === 1 ? '#111827' : '#6B7280' }]}>My Entries</ThemedText>
              </Pressable>
            </View>
          </Animated.View>

      <Animated.View style={makeFadeUp(entranceContent)}>
      {tab === 0 ? (
        Platform.OS === 'web' ? (
          <Animated.View style={{ opacity: contentOpacity, transform: [{ translateY: contentTranslateY }] }}>
            <Card style={{ marginTop: 24 }}>
              <CardContent>
                <ThemedText type="subtitle" style={{ marginTop: 16 }}>New Journal Entry</ThemedText>
                <ThemedText style={{ color: palette.muted, marginTop: 4, marginBottom: 8 }}>Write about your day, thoughts, or feelings. Your entries are private and secure.</ThemedText>

                {/* Title input */}
                <TextInput
                  placeholder="Title"
                  placeholderTextColor="#9BA1A6"
                  value={title}
                  onChangeText={setTitle}
                  selectionColor={focusGreen}
                  onFocus={() => setTitleFocused(true)}
                  onBlur={() => setTitleFocused(false)}
                  // @ts-ignore - web outline
                  style={[
                    styles.titleInput,
                    { borderColor: titleFocused ? focusGreen : palette.border },
                    { borderWidth: titleFocused ? 1.5 : 1 },
                    { outlineStyle: 'none' } as any,
                  ]}
                />

                <View style={StyleSheet.flatten([styles.editorWrap, { borderColor: bodyFocused ? focusGreen : palette.border, borderWidth: bodyFocused ? 1.5 : 1 }])}> 
                  <TextInput
                    placeholder="What's on your mind today? Write about your thoughts, feelings, or experiences..."
                    placeholderTextColor="#9BA1A6"
                    multiline
                    scrollEnabled
                    value={body}
                    onChangeText={setBody}
                    selectionColor={focusGreen}
                    onFocus={() => setBodyFocused(true)}
                    onBlur={() => setBodyFocused(false)}
                    // @ts-ignore - web outline
                    style={[styles.textarea, { outlineStyle: 'none' }]}
                  />
                </View>

                <View style={styles.counterRow}>
                  <ThemedText style={{ color: palette.icon }}>{wordCount} words • {charCount} characters</ThemedText>
                </View>

                {/* Toolbar */}
                <View style={styles.toolbar}>
                  <Button 
                    title="Voice" 
                    variant="outline" 
                    onPress={handleVoicePress} 
                    style={isListening ? { backgroundColor: '#DCFCE7', borderColor: '#0D8C4F' } : {}}
                  />
                  <View style={{ flex: 1 }} />
                  <Button title="Record Journal" onPress={handleSave} disabled={!body.trim() || isSaving} loading={isSaving} />
                </View>
              </CardContent>
            </Card>
          </Animated.View>
        ) : (
          <TouchableWithoutFeedback accessibilityRole="none" onPress={Keyboard.dismiss}>
            <Animated.View style={{ opacity: contentOpacity, transform: [{ translateY: contentTranslateY }] }}>
              <Card style={{ marginTop: 24 }}>
                <CardContent>
                  <ThemedText type="subtitle" style={{ marginTop: 16 }}>New Journal Entry</ThemedText>
                  <ThemedText style={{ color: palette.muted, marginTop: 4, marginBottom: 8 }}>Write about your day, thoughts, or feelings. Your entries are private and secure.</ThemedText>

                  {/* Title input */}
                  <TextInput
                    placeholder="Title"
                    placeholderTextColor="#9BA1A6"
                    value={title}
                    onChangeText={setTitle}
                    selectionColor={focusGreen}
                    onFocus={() => setTitleFocused(true)}
                    onBlur={() => setTitleFocused(false)}
                    // @ts-ignore - web outline
                    style={[
                      styles.titleInput,
                      { borderColor: titleFocused ? focusGreen : palette.border },
                      { borderWidth: titleFocused ? 1.5 : 1 },
                      { outlineStyle: 'none' } as any,
                    ]}
                  />

                  <View style={StyleSheet.flatten([styles.editorWrap, { borderColor: bodyFocused ? focusGreen : palette.border, borderWidth: bodyFocused ? 1.5 : 1 }])}> 
                    <TextInput
                      placeholder="What's on your mind today? Write about your thoughts, feelings, or experiences..."
                      placeholderTextColor="#9BA1A6"
                      multiline
                      scrollEnabled
                      value={body}
                      onChangeText={setBody}
                      selectionColor={focusGreen}
                      onFocus={() => setBodyFocused(true)}
                      onBlur={() => setBodyFocused(false)}
                      // @ts-ignore - web outline
                      style={[styles.textarea, { outlineStyle: 'none' }]}
                    />
                  </View>

                  <View style={styles.counterRow}>
                    <ThemedText style={{ color: palette.icon }}>{wordCount} words • {charCount} characters</ThemedText>
                  </View>

                  {/* Toolbar */}
                  <View style={styles.toolbar}>
                    <Button 
                      title="Voice" 
                      variant="outline" 
                      onPress={handleVoicePress} 
                      style={isListening ? { backgroundColor: '#DCFCE7', borderColor: '#0D8C4F' } : {}}
                    />
                    <View style={{ flex: 1 }} />
                    <Button title="Record Journal" onPress={handleSave} disabled={!body.trim() || isSaving} loading={isSaving} />
                  </View>
                </CardContent>
              </Card>
            </Animated.View>
          </TouchableWithoutFeedback>
        )
      ) : (
        <Animated.View style={{ marginTop: 16, opacity: contentOpacity, transform: [{ translateY: contentTranslateY }] }}>
          {entries.length > 0 ? (
            <>
              <View style={{ gap: 10 }}>
                {entries.map((e) => (
                  <EntryRow
                    key={e.id}
                    entry={e}
                    onDeleteRequest={handleRequestDelete}
                    getOpenRef={() => openSwipeRef.current}
                    setOpenRef={(inst) => (openSwipeRef.current = inst)}
                  />
                ))}
              </View>
            </>
          ) : (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <Feather name="book-open" size={28} color="#9CA3AF" />
              </View>
              <ThemedText style={{ fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#374151', marginBottom: 4 }}>
                {loadingEntries ? 'Loading entries...' : 'No entries yet'}
              </ThemedText>
              {!loadingEntries && (
                <ThemedText style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>
                  Start writing to see your entries here
                </ThemedText>
              )}
            </View>
          )}
        </Animated.View>
      )}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
      {/* Saved toast */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 24,
          transform: [{ translateY: toast.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
          opacity: toast,
        }}
      >
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderRadius: 12,
          backgroundColor: '#111827',
        }}>
          <Animated.View style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#10B981',
            transform: [{ scale: toast.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
          }}>
            <Feather name="check" size={14} color="#FFFFFF" />
          </Animated.View>
          <ThemedText style={{ color: '#FFFFFF' }}>Saved</ThemedText>
        </View>
      </Animated.View>
      <Modal visible={!!pendingDelete} transparent animationType="fade" onRequestClose={handleCancelDelete}>
        <View style={styles.overlay}>
          <Animated.View
            style={StyleSheet.flatten([
              styles.confirmCard,
              {
                transform: [
                  { scale: pendingDelete ? pendingDeleteScale.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) : 1 },
                  { translateY: pendingDelete ? pendingDeleteScale.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) : 0 },
                ],
                opacity: pendingDelete ? pendingDeleteScale : 0,
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
    </ThemedView>
  );
}

function EntryRow({ entry, onDeleteRequest, getOpenRef, setOpenRef }: { entry: Entry; onDeleteRequest: (entry: Entry) => void; getOpenRef?: () => Swipeable | null; setOpenRef?: (s: Swipeable | null) => void }) {
  const router = useRouter();
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme] as any;
  const scale = useRef(new Animated.Value(1)).current;
  const animate = (to: number, d = 110) =>
    Animated.timing(scale, { toValue: to, duration: d, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();

  const open = () => router.push({ pathname: '/(student)/(tabs)/journal/[id]', params: { id: entry.id } });

  const swipeRef = useRef<Swipeable | null>(null);
  // LEFT actions (swipe right): Open
  const LeftActions = (progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
    const bgOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
    const contentOpacity = progress.interpolate({ inputRange: [0, 0.08, 1], outputRange: [0, 0.95, 1] });
    const contentScale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] });
    const contentTx = dragX.interpolate({ inputRange: [0, 120], outputRange: [6, 0], extrapolate: 'clamp' });
    return (
      <Animated.View style={{ flex: 1, opacity: bgOpacity }}>
        <LinearGradient
          colors={["rgba(16,185,129,0.42)", "rgba(5,150,105,0.64)"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ flex: 1, justifyContent: 'center', alignItems: 'flex-start', paddingLeft: 8 }}
        >
          <Pressable onPress={open} style={{ alignSelf: 'flex-start' }}>
            <Animated.View
              style={{
                opacity: contentOpacity,
                transform: [{ translateX: contentTx }, { scale: contentScale }],
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 999,
                backgroundColor: 'rgba(255,255,255,0.35)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.65)'
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="arrow-right" size={20} color="#ffffff" />
                <ThemedText style={{ color: '#ffffff', fontFamily: 'Inter_700Bold', fontSize: 16 }}>Open</ThemedText>
              </View>
            </Animated.View>
          </Pressable>
        </LinearGradient>
      </Animated.View>
    );
  };
  const RightActions = (progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
    // RIGHT actions (swipe left): Delete with confirm dialog
    const bgOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
    const contentOpacity = progress.interpolate({ inputRange: [0, 0.08, 1], outputRange: [0, 0.95, 1] });
    const contentScale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] });
    const contentTx = dragX.interpolate({ inputRange: [-120, 0], outputRange: [-6, 0], extrapolate: 'clamp' });
    const confirmDelete = () => {
      if (Platform.OS !== 'web') {
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
      }
      onDeleteRequest(entry);
      if (getOpenRef?.() === swipeRef.current) setOpenRef?.(null);
    };
    return (
      <Animated.View style={{ flex: 1, opacity: bgOpacity }}>
        <LinearGradient
          colors={["rgba(239,68,68,0.75)", "rgba(220,38,38,0.55)"]}
          start={{ x: 1, y: 0.5 }}
          end={{ x: 0, y: 0.5 }}
          style={{ flex: 1, justifyContent: 'center', alignItems: 'flex-end', paddingRight: 8 }}
        >
          <Pressable onPress={confirmDelete} style={{ alignSelf: 'flex-end' }}>
            <Animated.View
              style={{
                opacity: contentOpacity,
                transform: [{ translateX: contentTx }, { scale: contentScale }],
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 999,
                backgroundColor: 'rgba(255,255,255,0.35)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.7)',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ThemedText style={{ color: '#ffffff', fontFamily: 'Inter_700Bold', fontSize: 16 }}>Delete</ThemedText>
                <Feather name="trash-2" size={20} color="#ffffff" />
              </View>
            </Animated.View>
          </Pressable>
        </LinearGradient>
      </Animated.View>
    );
  };

  return (
    <Swipeable
      ref={(r) => {
        swipeRef.current = r;
      }}
      renderRightActions={RightActions}
      renderLeftActions={LeftActions}
      overshootRight={false}
      overshootLeft={false}
      friction={1.6}
      overshootFriction={8}
      rightThreshold={44}
      leftThreshold={44}
      onSwipeableWillOpen={() => {
        // Close any other open row first
        const current = getOpenRef?.();
        if (current && current !== swipeRef.current) current.close();
        setOpenRef?.(swipeRef.current);
      }}
      // Do not auto-open or auto-delete on full swipe; require explicit tap on chips
      onSwipeableClose={() => {
        // Clear if this was the tracked one
        if (getOpenRef?.() === swipeRef.current) setOpenRef?.(null);
      }}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Pressable onPressIn={() => animate(0.98, 90)} onPressOut={() => animate(1, 120)} onPress={open}>
          <View style={entryRowStyles.card}>
            <View style={entryRowStyles.iconWrap}>
              <Image source={JournalListIcon} style={{ width: 28, height: 28 }} contentFit="contain" />
            </View>
            <View style={entryRowStyles.content}>
              <ThemedText style={entryRowStyles.title} numberOfLines={1}>{entry.title}</ThemedText>
              <ThemedText numberOfLines={2} style={entryRowStyles.body}>
                {entry.body}
              </ThemedText>
              <ThemedText style={entryRowStyles.date}>{entry.date || 'No date'}</ThemedText>
            </View>
            <View style={entryRowStyles.chevron}>
              <Feather name="chevron-right" size={18} color="#9CA3AF" />
            </View>
          </View>
        </Pressable>
      </Animated.View>
    </Swipeable>
  );
}

function ToolbarButton({ icon, label, disabled, onPress, active, bgColor, fgColor }: { icon: any; label: string; disabled?: boolean; onPress?: () => void; active?: boolean; bgColor?: string; fgColor?: string }) {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme] as any;
  const scale = useRef(new Animated.Value(1)).current;
  const animate = (to: number, d = 120) => Animated.timing(scale, { toValue: to, duration: d, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  return (
    <Pressable
      onPressIn={() => animate(0.97, 90)}
      onPressOut={() => animate(1, 120)}
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.toolBtn,
        {
          borderColor: bgColor ? 'transparent' : palette.border,
          opacity: disabled ? 0.6 : 1,
          backgroundColor: bgColor ? bgColor : active ? '#E6F4FE' : '#FFFFFF',
        },
      ]}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Feather name={icon} size={16} color={fgColor ?? (active ? '#0EA5E9' : palette.text)} />
          <ThemedText style={{ color: fgColor ?? (active ? '#0EA5E9' : palette.text) }}>{label}</ThemedText>
        </View>
      </Animated.View>
    </Pressable>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1 },
  segment: {
    flexDirection: 'row',
    borderRadius: 999,
    padding: 4,
    borderWidth: 1,
    overflow: 'hidden',
  },
  segmentIndicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    borderRadius: 999,
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 999,
  },
  segmentItemActiveWeb: {
    backgroundColor: '#FFFFFF',
  },
  segmentText: { fontFamily: 'Inter_500Medium' },

  editorWrap: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 8,
    marginTop: 12,
  },
  textarea: {
    minHeight: 200,
    padding: 14,
    textAlignVertical: 'top',
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    color: '#000000',
    lineHeight: 24,
  },
  counterRow: { alignItems: 'flex-end', marginTop: 12, marginBottom: 8 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 16 },
  toolBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
  },
  titleInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
    marginTop: 16,
    color: '#000000',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
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
  noticeBox: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4, marginTop: 6 },
  confirmIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  confirmEntryPreview: {
    alignSelf: 'stretch',
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
});

const entryRowStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    gap: 12,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F5F3FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#111827',
  },
  body: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  date: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  chevron: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
