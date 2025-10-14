import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { Animated, Easing, Pressable, StyleSheet, TextInput, View, Keyboard, Alert, TouchableWithoutFeedback, KeyboardAvoidingView, ScrollView, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { Feather } from '@expo/vector-icons';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Link, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';

type Entry = { id: string; title: string; body: string; date: string };

export default function JournalListScreen() {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme] as any;

  // Tabs: 0 = Write Entry, 1 = My Entries
  const [tab, setTab] = useState<0 | 1>(0);
  const [segW, setSegW] = useState(0);
  const animTab = useRef(new Animated.Value(0)).current;
  // Track currently open swipe row so only one stays open
  const openSwipeRef = useRef<Swipeable | null>(null);
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

  const handleAnalyzePress = () => {
    Alert.alert('Analyze', 'AI analyze feature is coming soon.');
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

  // Close any open swipe row on focus/blur to reset UI when navigating back
  useFocusEffect(
    useCallback(() => {
      // on focus
      openSwipeRef.current?.close();
      return () => {
        // on blur
        openSwipeRef.current?.close();
      };
    }, [])
  );

  // Editor state
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [titleFocused, setTitleFocused] = useState(false);
  const [bodyFocused, setBodyFocused] = useState(false);
  const wordCount = useMemo(() => (body.trim() ? body.trim().split(/\s+/).length : 0), [body]);
  const charCount = body.length;
  const [isSaving, setIsSaving] = useState(false);
  // Saved toast animation
  const toast = useRef(new Animated.Value(0)).current; // 0 hidden, 1 visible
  const showSavedToast = () => {
    Animated.timing(toast, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
      setTimeout(() => {
        Animated.timing(toast, { toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      }, 1200);
    });
  };

  // Sample entries (replace with data source later)
  const [entries, setEntries] = useState<Entry[]>([
    { id: '1', title: 'Grateful for small wins', body: 'Today I felt more present and calm after a short walk.', date: '2025-09-22' },
    { id: '2', title: 'A challenging day', body: 'Work was tough but I asked for help and that felt good.', date: '2025-09-18' },
  ]);

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
  const focusBlue = '#3B82F6';

  // Save handler (local state demo)
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
    // small delay to give a saving feel; replace with real API call later
    await new Promise((r) => setTimeout(r, 700));
    const newEntry: Entry = {
      id: String(Date.now()),
      title: title.trim(),
      body: text,
      date: new Date().toISOString().slice(0, 10),
    };
    setEntries((prev) => [newEntry, ...prev]);
    setBody('');
    setTitle('');
    onTabChange(1);
    setIsSaving(false);
    showSavedToast();
    if (Platform.OS !== 'web') {
      try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
    }
  };

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, paddingBottom: 100, backgroundColor: '#FFFFFF' }}
        >
          <View style={{ height: 16 }} />
          <ThemedText type="title">Journal</ThemedText>
          <ThemedText style={{ color: palette.muted }}>Express your thoughts and track your emotional journey</ThemedText>

      {/* Segmented control */}
      <View
        style={[styles.segment, { backgroundColor: '#EEF2F7', borderColor: palette.border, marginTop: 16 }]}
        onLayout={(e) => setSegW(e.nativeEvent.layout.width)}
      >
        <Animated.View pointerEvents="none" style={[styles.segmentIndicator, { backgroundColor: '#ffffff' }, indicatorStyle]} />
        <Pressable style={styles.segmentItem} onPress={() => onTabChange(0)} accessibilityRole="button" accessibilityState={tab === 0 ? { selected: true } : {}}>
          <Feather name="edit-3" size={16} color={palette.text} />
          <ThemedText style={styles.segmentText}>Write Entry</ThemedText>
        </Pressable>
        <Pressable style={styles.segmentItem} onPress={() => onTabChange(1)} accessibilityRole="button" accessibilityState={tab === 1 ? { selected: true } : {}}>
          <Feather name="book-open" size={16} color={palette.text} />
          <ThemedText style={styles.segmentText}>My Entries</ThemedText>
        </Pressable>
      </View>

      {tab === 0 ? (
        <TouchableWithoutFeedback accessibilityRole="none" onPress={Keyboard.dismiss}>
          <Animated.View style={{ opacity: contentOpacity, transform: [{ translateY: contentTranslateY }] }}>
            <Card style={{ marginTop: 16 }}>
              <CardContent>
                <ThemedText type="subtitle" style={{ marginTop: 12 }}>New Journal Entry</ThemedText>
                <ThemedText style={{ color: palette.muted }}>Write about your day, thoughts, or feelings. Your entries are private and secure.</ThemedText>

                {/* Title input */}
                <TextInput
                  placeholder="Title"
                  placeholderTextColor="#9BA1A6"
                  value={title}
                  onChangeText={setTitle}
                  style={StyleSheet.flatten([styles.titleInput, { borderColor: titleFocused ? focusBlue : palette.border }])}
                  onFocus={() => setTitleFocused(true)}
                  onBlur={() => setTitleFocused(false)}
                />

                <View style={StyleSheet.flatten([styles.editorWrap, { borderColor: bodyFocused ? focusBlue : palette.border, backgroundColor: '#FFFFFF' }])}> 
                  <TextInput
                    placeholder="What's on your mind today? Write about your thoughts, feelings, or experiences..."
                    placeholderTextColor="#9BA1A6"
                    multiline
                    scrollEnabled
                    value={body}
                    onChangeText={setBody}
                    onFocus={() => setBodyFocused(true)}
                    onBlur={() => setBodyFocused(false)}
                    style={styles.textarea}
                  />
                </View>

                <View style={styles.counterRow}>
                  <ThemedText style={{ color: palette.icon }}>{wordCount} words • {charCount} characters</ThemedText>
                </View>

                {/* Toolbar */}
                <View style={styles.toolbar}>
                  <ToolbarButton icon="mic" label="Voice" onPress={handleVoicePress} active={isListening} bgColor="#FEE2E2" fgColor="#B91C1C" />
                  <ToolbarButton icon="activity" label="Analyze" onPress={handleAnalyzePress} bgColor="#EDE9FE" fgColor="#6D28D9" />
                  <View style={{ flex: 1 }} />
                  <Button title="Save" onPress={handleSave} disabled={!body.trim() || isSaving} loading={isSaving} />
                </View>
              </CardContent>
            </Card>
          </Animated.View>
        </TouchableWithoutFeedback>
      ) : (
        <Animated.View style={{ gap: 8, marginTop: 12, opacity: contentOpacity, transform: [{ translateY: contentTranslateY }] }}>
          {entries.map((e) => (
            <EntryRow
              key={e.id}
              entry={e}
              onDelete={(id) => setEntries((prev) => prev.filter((it) => it.id !== id))}
              getOpenRef={() => openSwipeRef.current}
              setOpenRef={(inst) => (openSwipeRef.current = inst)}
            />
          ))}
        </Animated.View>
      )}
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
    </ThemedView>
  );
}

function EntryRow({ entry, onDelete, getOpenRef, setOpenRef }: { entry: Entry; onDelete: (id: string) => void; getOpenRef?: () => Swipeable | null; setOpenRef?: (s: Swipeable | null) => void }) {
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
      Alert.alert('Delete entry?', 'This action cannot be undone.', [
        { text: 'Cancel', style: 'cancel', onPress: () => swipeRef.current?.close() },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            onDelete(entry.id);
            if (getOpenRef?.() === swipeRef.current) setOpenRef?.(null);
          },
        },
      ]);
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
                shadowColor: '#7f1d1d',
                shadowOpacity: 0.35,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 2 },
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
          <Card>
            <CardContent>
              <ThemedText type="subtitle">{entry.title}</ThemedText>
              <ThemedText numberOfLines={1} style={{ color: palette.muted }}>
                {entry.body}
              </ThemedText>
            </CardContent>
          </Card>
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
  },
  segmentText: { fontFamily: 'Inter_500Medium' },

  editorWrap: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 6,
    marginTop: 8,
  },
  textarea: {
    minHeight: 160,
    padding: 12,
    textAlignVertical: 'top',
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    color: '#000000',
  },
  counterRow: { alignItems: 'flex-end' },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
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
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
    marginTop: 10,
    color: '#000000',
  },
});
