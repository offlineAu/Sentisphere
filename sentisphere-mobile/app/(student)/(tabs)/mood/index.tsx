import { StyleSheet, View, ScrollView, Pressable, Animated, Easing, Platform, Image, KeyboardAvoidingView, useWindowDimensions } from 'react-native';
import { useState, useEffect, useRef, useCallback } from 'react';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Textarea } from '@/components/ui/textarea';
import { Icon } from '@/components/ui/icon';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TOTAL_STEPS = 5;

type MoodOption = { key: string; emoji: string; label: string; color: string };
type EnergyOption = { key: string; emoji: string; label: string; color: string };
type StressOption = { key: string; emoji: string; label: string; color: string };

export default function MoodScreen() {
  const [step, setStep] = useState(0);
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [selectedEnergy, setSelectedEnergy] = useState<string | null>(null);
  const [selectedStress, setSelectedStress] = useState<string | null>(null);
  const [selectedFeelBetter, setSelectedFeelBetter] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [displayName, setDisplayName] = useState<string>('');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme] as any;
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const API = process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:8010';

  // Responsive calculations for different screen sizes
  const isSmallScreen = screenWidth < 375;
  const isMediumScreen = screenWidth >= 375 && screenWidth < 414;
  const HORIZONTAL_PADDING = isSmallScreen ? 16 : 24;
  const GRID_GAP = isSmallScreen ? 8 : 12;
  const COLUMNS = 3;
  // Calculate button width: (screenWidth - padding*2 - gaps*(columns-1)) / columns
  const emojiButtonWidth = Math.floor((screenWidth - (HORIZONTAL_PADDING * 2) - (GRID_GAP * (COLUMNS - 1))) / COLUMNS);
  
  // Responsive font and element sizes
  const titleFontSize = isSmallScreen ? 26 : isMediumScreen ? 28 : 32;
  const emojiSize = isSmallScreen ? 28 : 32;
  const emojiCircleSize = isSmallScreen ? 48 : 56;
  
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const successAnim = useRef(new Animated.Value(0)).current;

  // Entrance animations
  const entrance = useRef({
    header: new Animated.Value(0),
    content: new Animated.Value(0),
    footer: new Animated.Value(0),
  }).current;

  const runEntrance = useCallback(() => {
    entrance.header.setValue(0);
    entrance.content.setValue(0);
    entrance.footer.setValue(0);
    Animated.stagger(120, [
      Animated.timing(entrance.header, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(entrance.content, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(entrance.footer, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    runEntrance();
  }, []);

  useFocusEffect(
    useCallback(() => {
      runEntrance();
      return () => {};
    }, [])
  );

  const makeFadeUp = (v: Animated.Value) => ({
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
  });

  const moods: MoodOption[] = [
    { key: 'awesome', emoji: '🤩', label: 'Awesome', color: '#FB923C' },
    { key: 'great', emoji: '😊', label: 'Great', color: '#FBBF24' },
    { key: 'loved', emoji: '🥰', label: 'Loved', color: '#FDBA74' },
    { key: 'okay', emoji: '😐', label: 'Okay', color: '#FDE68A' },
    { key: 'meh', emoji: '😒', label: 'Meh', color: '#9CA3AF' },
    { key: 'anxious', emoji: '😨', label: 'Anxious', color: '#6EE7B7' },
    { key: 'bad', emoji: '😢', label: 'Bad', color: '#7DD3FC' },
    { key: 'terrible', emoji: '😫', label: 'Terrible', color: '#C4B5FD' },
    { key: 'upset', emoji: '😡', label: 'Upset', color: '#FCA5A5' },
  ];

  const energies: EnergyOption[] = [
    { key: 'very-high', emoji: '⚡', label: 'Very High', color: '#EF4444' },
    { key: 'high', emoji: '🔥', label: 'High', color: '#F59E0B' },
    { key: 'moderate', emoji: '✨', label: 'Moderate', color: '#22C55E' },
    { key: 'low', emoji: '🌙', label: 'Low', color: '#6B7280' },
    { key: 'very-low', emoji: '😴', label: 'Very Low', color: '#3B82F6' },
  ];

  const stresses: StressOption[] = [
    { key: 'no-stress', emoji: '😌', label: 'No Stress', color: '#22C55E' },
    { key: 'low-stress', emoji: '🙂', label: 'Low Stress', color: '#84CC16' },
    { key: 'moderate', emoji: '😐', label: 'Moderate', color: '#F59E0B' },
    { key: 'high-stress', emoji: '😓', label: 'High Stress', color: '#EF4444' },
    { key: 'very-high', emoji: '🤯', label: 'Very High', color: '#DC2626' },
  ];

  const moodLabelMap: Record<string, string> = {
    'awesome': 'Awesome',
    'great': 'Great',
    'loved': 'Loved',
    'okay': 'Okay',
    'meh': 'Meh',
    'anxious': 'Anxious',
    'bad': 'Bad',
    'terrible': 'Terrible',
    'upset': 'Upset',
  };

  const energyLabelMap: Record<string, string> = {
    'very-high': 'Very High',
    'high': 'High',
    'moderate': 'Moderate',
    'low': 'Low',
    'very-low': 'Very Low',
  };

  const stressLabelMap: Record<string, string> = {
    'no-stress': 'No Stress',
    'low-stress': 'Low Stress',
    'moderate': 'Moderate',
    'high-stress': 'High Stress',
    'very-high': 'Very High',
  };

  type FeelBetterOption = { key: string; emoji: string; label: string; color: string };
  const feelBetterOptions: FeelBetterOption[] = [
    { key: 'better', emoji: '👍', label: 'Yay!', color: '#0D8C4F' },
    { key: 'same', emoji: '☁️', label: 'Same', color: '#60A5FA' },
    { key: 'worse', emoji: '👎', label: 'Nope', color: '#EF4444' },
  ];

  const getAuthToken = async (): Promise<string | null> => {
    if (Platform.OS === 'web') {
      try { return (window as any)?.localStorage?.getItem('auth_token') || null } catch { return null }
    }
    try { return await SecureStore.getItemAsync('auth_token') } catch { return null }
  };

  // Fetch user's nickname
  const fetchUserName = useCallback(async () => {
    try {
      const tok = await getAuthToken();
      if (!tok) return;
      // Try to decode from JWT first
      try {
        const p = tok.split('.')[1];
        if (p) {
          const s = p.replace(/-/g, '+').replace(/_/g, '/');
          const pad = s.length % 4 ? s + '='.repeat(4 - (s.length % 4)) : s;
          const json = typeof atob === 'function' ? atob(pad) : '';
          if (json) {
            const obj = JSON.parse(json);
            const name = obj?.nickname || obj?.name;
            if (name) { setDisplayName(name); return; }
          }
        }
      } catch {}
      // Fallback to API
      const res = await fetch(`${API}/api/auth/mobile/me`, { headers: { Authorization: `Bearer ${tok}` } });
      if (res.ok) {
        const d = await res.json();
        setDisplayName(d?.nickname || d?.name || 'there');
      }
    } catch {}
  }, [API]);

  useEffect(() => {
    fetchUserName();
  }, [fetchUserName]);

  useEffect(() => {
    if (submitted) {
      successAnim.setValue(0);
      Animated.timing(successAnim, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      if (Platform.OS !== 'web') { try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch {} }
    }
  }, [submitted]);

  const animateTransition = (direction: 'next' | 'back', callback: () => void) => {
    const toValue = direction === 'next' ? -50 : 50;
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start(() => {
      callback();
      slideAnim.setValue(direction === 'next' ? 50 : -50);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 250, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, stiffness: 200, damping: 20, mass: 0.8, useNativeDriver: true }),
      ]).start();
    });
  };

  const goNext = () => {
    if (step < TOTAL_STEPS - 1) {
      if (Platform.OS !== 'web') { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {} }
      animateTransition('next', () => setStep(step + 1));
    }
  };

  const selectMoodAndProceed = (key: string) => {
    setSelectedMood(key);
    setTimeout(() => goNext(), 300);
  };

  const selectEnergyAndProceed = (key: string) => {
    setSelectedEnergy(key);
    setTimeout(() => goNext(), 300);
  };

  const selectStressAndProceed = (key: string) => {
    setSelectedStress(key);
    setTimeout(() => goNext(), 300);
  };

  const selectFeelBetterAndProceed = (key: string) => {
    setSelectedFeelBetter(key);
    setTimeout(() => goNext(), 300);
  };

  const goBack = () => {
    if (step > 0) {
      if (Platform.OS !== 'web') { try { Haptics.selectionAsync() } catch {} }
      animateTransition('back', () => {
        const prevStep = step - 1;
        if (prevStep === 0) setSelectedMood(null);
        if (prevStep === 1) setSelectedEnergy(null);
        if (prevStep === 2) setSelectedStress(null);
        if (prevStep === 3) setSelectedFeelBetter(null);
        setStep(prevStep);
      });
    } else {
      router.back();
    }
  };

  const handleSubmit = async () => {
    setError(null);
    if (!selectedMood || !selectedEnergy || !selectedStress) {
      setError('Please complete all selections');
      return;
    }
    setSaving(true);
    try {
      const tok = await getAuthToken();
      if (!tok) {
        setError('Not signed in');
        setSaving(false);
        return;
      }
      const payload = {
        mood_level: moodLabelMap[selectedMood] || 'Neutral',
        energy_level: energyLabelMap[selectedEnergy] || 'Moderate',
        stress_level: stressLabelMap[selectedStress] || 'Moderate',
        comment: note && note.trim() ? note.trim() : undefined,
      };
      const res = await fetch(`${API}/api/emotional-checkins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let detail = '';
        try { const d = await res.json(); detail = d?.detail || d?.message || '' } catch {}
        throw new Error(detail || `Save failed: ${res.status}`);
      }
      setSubmitted(true);
    } catch (e: any) {
      setError(e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setStep(0);
    setSelectedMood(null);
    setSelectedEnergy(null);
    setSelectedStress(null);
    setSelectedFeelBetter(null);
    setNote('');
    setSubmitted(false);
    setError(null);
  };

  const EmojiButton = ({ emoji, label, color, selected, onPress, buttonWidth }: { emoji: string; label: string; color: string; selected: boolean; onPress: () => void; buttonWidth: number }) => {
    const scale = useRef(new Animated.Value(1)).current;
    
    const handlePressIn = () => {
      Animated.spring(scale, { toValue: 0.9, useNativeDriver: true, stiffness: 300, damping: 15 }).start();
      if (Platform.OS !== 'web') { try { Haptics.selectionAsync() } catch {} }
    };
    
    const handlePressOut = () => {
      Animated.spring(scale, { toValue: selected ? 1.05 : 1, useNativeDriver: true, stiffness: 300, damping: 15 }).start();
    };

    useEffect(() => {
      Animated.spring(scale, { toValue: selected ? 1.1 : 1, useNativeDriver: true, stiffness: 300, damping: 15 }).start();
    }, [selected]);

    return (
      <Pressable onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut}>
        <Animated.View style={[
          styles.emojiButton, 
          { 
            width: buttonWidth,
            paddingVertical: isSmallScreen ? 12 : 16,
          }, 
          selected && { backgroundColor: `${color}15`, borderColor: color, borderWidth: 2 }, 
          { transform: [{ scale }] }
        ]}>
          <View style={[
            styles.emojiCircle, 
            { 
              backgroundColor: `${color}20`,
              width: emojiCircleSize,
              height: emojiCircleSize,
              borderRadius: emojiCircleSize / 2,
            }
          ]}>
            <ThemedText style={[styles.emojiLarge, { fontSize: emojiSize }]}>{emoji}</ThemedText>
          </View>
          <ThemedText style={[
            styles.emojiLabel, 
            { fontSize: isSmallScreen ? 11 : 13 },
            selected && { color, fontFamily: 'Inter_600SemiBold' }
          ]}>{label}</ThemedText>
        </Animated.View>
      </Pressable>
    );
  };

  const ChipButton = ({ emoji, label, color, selected, onPress }: { emoji: string; label: string; color: string; selected: boolean; onPress: () => void }) => {
    const scale = useRef(new Animated.Value(1)).current;
    
    const handlePressIn = () => {
      Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, stiffness: 300, damping: 15 }).start();
      if (Platform.OS !== 'web') { try { Haptics.selectionAsync() } catch {} }
    };
    
    const handlePressOut = () => {
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, stiffness: 300, damping: 15 }).start();
    };

    return (
      <Pressable onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut}>
        <Animated.View style={[styles.chipButton, selected && { backgroundColor: `${color}15`, borderColor: color, borderWidth: 2 }, { transform: [{ scale }] }]}>
          <ThemedText style={styles.chipEmoji}>{emoji}</ThemedText>
          <ThemedText style={[styles.chipLabel, selected && { color, fontFamily: 'Inter_600SemiBold' }]}>{label}</ThemedText>
        </Animated.View>
      </Pressable>
    );
  };

  const ProgressDots = () => (
    <View style={styles.progressDots}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={[styles.dot, step === i && styles.dotActive, step > i && styles.dotCompleted]} />
      ))}
    </View>
  );

  const FeelBetterButton = ({ emoji, label, color, selected, onPress }: { emoji: string; label: string; color: string; selected: boolean; onPress: () => void }) => {
    const scale = useRef(new Animated.Value(1)).current;
    
    const handlePressIn = () => {
      Animated.spring(scale, { toValue: 0.9, useNativeDriver: true, stiffness: 300, damping: 15 }).start();
      if (Platform.OS !== 'web') { try { Haptics.selectionAsync() } catch {} }
    };
    
    const handlePressOut = () => {
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, stiffness: 300, damping: 15 }).start();
    };

    useEffect(() => {
      Animated.spring(scale, { toValue: selected ? 1.1 : 1, useNativeDriver: true, stiffness: 300, damping: 15 }).start();
    }, [selected]);

    return (
      <Pressable onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut}>
        <Animated.View style={[styles.feelBetterButton, selected && { backgroundColor: `${color}15`, borderColor: color, borderWidth: 2 }, { transform: [{ scale }] }]}>
          <ThemedText style={styles.feelBetterEmoji}>{emoji}</ThemedText>
          <ThemedText style={[styles.feelBetterLabel, selected && { color, fontFamily: 'Inter_600SemiBold' }]}>{label}</ThemedText>
        </Animated.View>
      </Pressable>
    );
  };

  const canProceed = () => {
    if (step === 0) return !!selectedMood;
    if (step === 1) return !!selectedEnergy;
    if (step === 2) return !!selectedStress;
    return true;
  };

  const getSelectedMoodEmoji = () => moods.find(m => m.key === selectedMood)?.emoji || '😊';

  if (submitted) {
    return (
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.successContainer}>
          <Animated.View style={{ alignItems: 'center', gap: 16, opacity: successAnim, transform: [{ scale: successAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] }}>
            <View style={styles.successIconWrap}>
              <Image source={require('../../../../assets/images/verified.png')} style={{ width: 100, height: 100 }} accessibilityLabel="Success" />
            </View>
            <ThemedText style={styles.successTitle}>Thanks for checking in!</ThemedText>
            <ThemedText style={styles.successSubtitle}>Your mood has been recorded. Keep tracking to see your patterns.</ThemedText>
            <View style={styles.successActions}>
              <Pressable style={styles.primaryButton} onPress={() => router.push('/(student)/(tabs)/dashboard')}>
                <ThemedText style={styles.primaryButtonText}>Back to Dashboard</ThemedText>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={reset}>
                <ThemedText style={styles.secondaryButtonText}>Check in again</ThemedText>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <Animated.View style={[styles.header, makeFadeUp(entrance.header)]}>
        <Pressable onPress={goBack} style={styles.backButton}>
          <Icon name="chevron-left" size={24} color="#111827" />
        </Pressable>
        <ProgressDots />
        <View style={{ width: 40 }} />
      </Animated.View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View style={[styles.stepContainer, makeFadeUp(entrance.content), { opacity: Animated.multiply(entrance.content, fadeAnim), transform: [{ translateX: slideAnim }] }]}>
          {step === 0 && (
            <ScrollView 
              style={[styles.stepScrollContent, { paddingHorizontal: HORIZONTAL_PADDING }]} 
              contentContainerStyle={[styles.stepScrollInner, { paddingTop: isSmallScreen ? 8 : 12 }]} 
              showsVerticalScrollIndicator={false}
            >
              <View style={[styles.stepHeader, { marginTop: isSmallScreen ? 8 : 12, marginBottom: isSmallScreen ? 8 : 12 }]}>
                <ThemedText style={[styles.welcomeEmoji, { fontSize: isSmallScreen ? 40 : 48 }]}>👋</ThemedText>
              </View>
              <ThemedText style={[styles.stepTitle, { fontSize: titleFontSize, lineHeight: titleFontSize * 1.25, marginBottom: isSmallScreen ? 20 : 28 }]}>
                How are you{'\n'}feeling right now?
              </ThemedText>
              <View style={[styles.moodGrid, { gap: GRID_GAP }]}>
                {moods.map((m) => (
                  <EmojiButton
                    key={m.key}
                    emoji={m.emoji}
                    label={m.label}
                    color={m.color}
                    selected={selectedMood === m.key}
                    onPress={() => selectMoodAndProceed(m.key)}
                    buttonWidth={emojiButtonWidth}
                  />
                ))}
              </View>
            </ScrollView>
          )}

          {step === 1 && (
            <ScrollView 
              style={[styles.stepScrollContent, { paddingHorizontal: HORIZONTAL_PADDING }]} 
              contentContainerStyle={[styles.stepScrollInner, { paddingTop: isSmallScreen ? 8 : 12 }]} 
              showsVerticalScrollIndicator={false}
            >
              <View style={[styles.stepHeader, { marginTop: isSmallScreen ? 8 : 12, marginBottom: isSmallScreen ? 8 : 12 }]}>
                <ThemedText style={[styles.selectedEmoji, { fontSize: isSmallScreen ? 40 : 48 }]}>{getSelectedMoodEmoji()}</ThemedText>
              </View>
              <ThemedText style={[styles.stepTitle, { fontSize: titleFontSize, lineHeight: titleFontSize * 1.25, marginBottom: isSmallScreen ? 20 : 28 }]}>
                What's your{'\n'}energy level?
              </ThemedText>
              <View style={[styles.chipGrid, { gap: GRID_GAP }]}>
                {energies.map((e) => (
                  <ChipButton
                    key={e.key}
                    emoji={e.emoji}
                    label={e.label}
                    color={e.color}
                    selected={selectedEnergy === e.key}
                    onPress={() => selectEnergyAndProceed(e.key)}
                  />
                ))}
              </View>
            </ScrollView>
          )}

          {step === 2 && (
            <ScrollView 
              style={[styles.stepScrollContent, { paddingHorizontal: HORIZONTAL_PADDING }]} 
              contentContainerStyle={[styles.stepScrollInner, { paddingTop: isSmallScreen ? 8 : 12 }]} 
              showsVerticalScrollIndicator={false}
            >
              <View style={[styles.stepHeader, { marginTop: isSmallScreen ? 8 : 12, marginBottom: isSmallScreen ? 8 : 12 }]}>
                <ThemedText style={[styles.selectedEmoji, { fontSize: isSmallScreen ? 40 : 48 }]}>{getSelectedMoodEmoji()}</ThemedText>
              </View>
              <ThemedText style={[styles.stepTitle, { fontSize: titleFontSize, lineHeight: titleFontSize * 1.25, marginBottom: isSmallScreen ? 20 : 28 }]}>
                How stressed{'\n'}do you feel?
              </ThemedText>
              <View style={[styles.chipGrid, { gap: GRID_GAP }]}>
                {stresses.map((s) => (
                  <ChipButton
                    key={s.key}
                    emoji={s.emoji}
                    label={s.label}
                    color={s.color}
                    selected={selectedStress === s.key}
                    onPress={() => selectStressAndProceed(s.key)}
                  />
                ))}
              </View>
            </ScrollView>
          )}

          {step === 3 && (
            <ScrollView 
              style={[styles.stepScrollContent, { paddingHorizontal: HORIZONTAL_PADDING }]} 
              contentContainerStyle={[styles.stepScrollInner, { paddingTop: isSmallScreen ? 8 : 12 }]} 
              showsVerticalScrollIndicator={false}
            >
              <View style={[styles.stepHeader, { marginTop: isSmallScreen ? 8 : 12, marginBottom: isSmallScreen ? 4 : 8 }]}>
                <ThemedText style={[styles.selectedEmoji, { fontSize: isSmallScreen ? 40 : 48 }]}>{getSelectedMoodEmoji()}</ThemedText>
              </View>
              <ThemedText style={[styles.stepTitleFeelBetter, { fontSize: isSmallScreen ? 24 : 28, lineHeight: isSmallScreen ? 32 : 38 }]}>
                {displayName ? `${displayName},` : 'Hey,'}{'\n'}do you feel better{'\n'}than yesterday?
              </ThemedText>
              <View style={[styles.feelBetterGrid, { gap: isSmallScreen ? 12 : 16 }]}>
                {feelBetterOptions.map((f) => (
                  <FeelBetterButton
                    key={f.key}
                    emoji={f.emoji}
                    label={f.label}
                    color={f.color}
                    selected={selectedFeelBetter === f.key}
                    onPress={() => selectFeelBetterAndProceed(f.key)}
                  />
                ))}
              </View>
            </ScrollView>
          )}

          {step === 4 && (
            <ScrollView 
              style={[styles.stepScrollContent, { paddingHorizontal: HORIZONTAL_PADDING }]} 
              contentContainerStyle={[styles.stepScrollInner, { paddingTop: isSmallScreen ? 8 : 12 }]} 
              showsVerticalScrollIndicator={false} 
              keyboardShouldPersistTaps="handled"
            >
              <View style={[styles.stepHeader, { marginTop: isSmallScreen ? 8 : 12, marginBottom: isSmallScreen ? 8 : 12 }]}>
                <ThemedText style={[styles.selectedEmoji, { fontSize: isSmallScreen ? 40 : 48 }]}>{getSelectedMoodEmoji()}</ThemedText>
              </View>
              <ThemedText style={[styles.stepTitle, { fontSize: titleFontSize, lineHeight: titleFontSize * 1.25, marginBottom: isSmallScreen ? 20 : 28 }]}>
                Anything else{'\n'}on your mind?
              </ThemedText>
              <ThemedText style={[styles.stepSubtitle, { marginTop: isSmallScreen ? -12 : -16, marginBottom: isSmallScreen ? 16 : 20 }]}>
                Add a note about what's affecting your mood (optional)
              </ThemedText>
              <View style={styles.noteCard}>
                <Textarea
                  placeholder="What's on your mind today..."
                  value={note}
                  onChangeText={setNote}
                  style={styles.noteInput}
                  placeholderTextColor="#9CA3AF"
                />
              </View>
              {error ? <ThemedText style={styles.errorText}>{error}</ThemedText> : null}
            </ScrollView>
          )}
        </Animated.View>

        {step === 4 && (
          <Animated.View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16), paddingHorizontal: HORIZONTAL_PADDING }, makeFadeUp(entrance.footer)]}>
            <Pressable 
              style={[styles.continueButton, saving && styles.continueButtonDisabled]} 
              onPress={handleSubmit}
              disabled={saving}
            >
              <ThemedText style={styles.continueButtonText}>{saving ? 'Saving...' : 'Record Mood'}</ThemedText>
              <Icon name="check" size={20} color="#FFFFFF" />
            </Pressable>
          </Animated.View>
        )}
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  progressDots: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E5E7EB',
  },
  dotActive: {
    backgroundColor: '#10B981',
    width: 24,
  },
  dotCompleted: {
    backgroundColor: '#10B981',
  },
  stepContainer: {
    flex: 1,
  },
  stepContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  stepScrollContent: {
    flex: 1,
  },
  stepScrollInner: {
    paddingBottom: 32,
    flexGrow: 1,
  },
  stepHeader: {
    alignItems: 'center',
  },
  selectedEmoji: {
    fontSize: 48,
  },
  welcomeEmoji: {
    fontSize: 48,
  },
  checkinBadge: {
    backgroundColor: '#0D8C4F',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 12,
  },
  checkinBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1,
  },
  stepTitle: {
    fontSize: 32,
    fontFamily: 'Inter_700Bold',
    color: '#111827',
    textAlign: 'center',
    lineHeight: 40,
    marginBottom: 24,
  },
  stepSubtitle: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: -16,
    marginBottom: 20,
  },
  moodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  emojiButton: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  emojiCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emojiLarge: {
    fontSize: 32,
  },
  emojiLabel: {
    fontSize: 13,
    color: '#374151',
    fontFamily: 'Inter_500Medium',
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 50,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  chipEmoji: {
    fontSize: 20,
  },
  chipLabel: {
    fontSize: 15,
    color: '#374151',
    fontFamily: 'Inter_500Medium',
  },
  stepTitleFeelBetter: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    color: '#111827',
    textAlign: 'center',
    lineHeight: 38,
    marginTop: 4,
    marginBottom: 24,
  },
  feelBetterGrid: {
    alignItems: 'center',
  },
  feelBetterButton: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 20,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minWidth: 140,
  },
  feelBetterEmoji: {
    fontSize: 48,
    marginBottom: 4,
  },
  feelBetterLabel: {
    fontSize: 16,
    color: '#374151',
    fontFamily: 'Inter_500Medium',
  },
  noteCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 4,
  },
  noteInput: {
    minHeight: 140,
    fontSize: 16,
    color: '#111827',
    textAlignVertical: 'top',
    padding: 16,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  footer: {
    paddingTop: 12,
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0D8C4F',
    paddingVertical: 16,
    borderRadius: 50,
  },
  continueButtonDisabled: {
    backgroundColor: '#E5E7EB',
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  continueButtonTextDisabled: {
    color: '#9CA3AF',
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  successIconWrap: {
    marginBottom: 8,
  },
  successTitle: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    color: '#111827',
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    marginHorizontal: 24,
    marginTop: -8,
  },
  successActions: {
    flexDirection: 'row',
    marginTop: 24,
    gap: 10,
    width: '100%',
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#0D8C4F',
    paddingVertical: 12,
    borderRadius: 50,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    paddingVertical: 12,
    borderRadius: 50,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#374151',
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  errorText: {
    marginTop: 12,
    color: '#DC2626',
    fontSize: 14,
    textAlign: 'center',
  },
});
