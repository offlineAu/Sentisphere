import { StyleSheet, View, ScrollView, Pressable, Animated, Easing, Platform } from 'react-native';
import { useState } from 'react';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

type MoodOption = { key: string; emoji: string; label: string };

export default function MoodScreen() {
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [selectedEnergy, setSelectedEnergy] = useState<string | null>(null);
  const [selectedStress, setSelectedStress] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme] as any;

  const moods: MoodOption[] = [
    { key: 'very-sad', emoji: '😢', label: 'Very Sad' },
    { key: 'sad', emoji: '😔', label: 'Sad' },
    { key: 'neutral', emoji: '😐', label: 'Neutral' },
    { key: 'good', emoji: '🙂', label: 'Good' },
    { key: 'happy', emoji: '😊', label: 'Happy' },
    { key: 'very-happy', emoji: '😁', label: 'Very Happy' },
    { key: 'excellent', emoji: '🤩', label: 'Excellent' },
  ];

  const energies = ['Very Low', 'Low', 'Moderate', 'High', 'Very High'];
  const stresses = ['No Stress', 'Low Stress', 'Moderate', 'High Stress', 'Very High'];

  // Active color maps for intensity levels
  const energyColors: Record<string, { bg: string; border: string; text: string }> = {
    'Very Low': { bg: '#E5E7EB', border: '#D1D5DB', text: '#6B7280' },
    'Low': { bg: '#FFEDD5', border: '#FED7AA', text: '#EA580C' },
    'Moderate': { bg: '#FEF3C7', border: '#FDE68A', text: '#D97706' },
    'High': { bg: '#DCFCE7', border: '#BBF7D0', text: '#16A34A' },
    'Very High': { bg: '#FEE2E2', border: '#FECACA', text: '#DC2626' }, // subtle red as requested
  };
  const stressColors: Record<string, { bg: string; border: string; text: string }> = {
    'No Stress': { bg: '#D1FAE5', border: '#A7F3D0', text: '#059669' },
    'Low Stress': { bg: '#ECFDF5', border: '#D1FAE5', text: '#10B981' },
    'Moderate': { bg: '#FEF3C7', border: '#FDE68A', text: '#D97706' },
    'High Stress': { bg: '#FEE2E2', border: '#FECACA', text: '#DC2626' },
    'Very High': { bg: '#FEE2E2', border: '#FECACA', text: '#B91C1C' }, // subtle red
  };

  // Local animated selectable components
  const MoodPillItem = ({ emoji, label, active, onPress }: { emoji: string; label: string; active: boolean; onPress: () => void }) => {
    const scale = (useState(() => new Animated.Value(1))[0]);
    const ease = Easing.bezier(0.22, 1, 0.36, 1);
    const to = (v: number, d = 180) => Animated.timing(scale, { toValue: v, duration: d, easing: ease, useNativeDriver: true }).start();
    return (
      <Pressable
        onPress={onPress}
        onHoverIn={() => to(1.05, 180)}
        onHoverOut={() => to(1, 180)}
        onPressIn={() => { to(0.97, 100); if (Platform.OS !== 'web') { try { Haptics.selectionAsync() } catch {} } }}
        onPressOut={() => Animated.spring(scale, { toValue: 1.04, stiffness: 240, damping: 18, mass: 0.85, useNativeDriver: true }).start()}
        style={({ pressed }) => ({ opacity: pressed ? 0.96 : 1 })}
      >
        <Animated.View style={StyleSheet.flatten([styles.moodPill, active && styles.moodPillActive, { transform: [{ scale }] }])}>
          <ThemedText style={styles.moodEmoji}>{emoji}</ThemedText>
          <ThemedText style={StyleSheet.flatten([styles.moodPillLabel, active && styles.moodPillLabelActive])}>{label}</ThemedText>
        </Animated.View>
      </Pressable>
    );
  };

  const ChipItem = ({ text, active, onPress, activeBg, activeBorder, activeText }: { text: string; active: boolean; onPress: () => void; activeBg?: string; activeBorder?: string; activeText?: string }) => {
    const scale = (useState(() => new Animated.Value(1))[0]);
    const ease = Easing.bezier(0.22, 1, 0.36, 1);
    const to = (v: number, d = 180) => Animated.timing(scale, { toValue: v, duration: d, easing: ease, useNativeDriver: true }).start();
    const handlePress = () => {
      onPress?.();
      // Bounce only on the pressed chip
      Animated.sequence([
        Animated.spring(scale, { toValue: 1.08, stiffness: 260, damping: 20, mass: 0.85, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 160, easing: ease, useNativeDriver: true }),
      ]).start();
    };
    return (
      <Pressable
        onPress={handlePress}
        onHoverIn={() => to(1.05, 180)}
        onHoverOut={() => to(1, 180)}
        onPressIn={() => { to(0.97, 100); if (Platform.OS !== 'web') { try { Haptics.selectionAsync() } catch {} } }}
        onPressOut={() => to(1, 140)}
        style={({ pressed }) => ({ opacity: pressed ? 0.96 : 1 })}
      >
        <Animated.View style={StyleSheet.flatten([styles.chip, active && { backgroundColor: activeBg, borderColor: activeBorder }, { transform: [{ scale }] }])}>
          <ThemedText style={StyleSheet.flatten([styles.chipText, active && styles.chipTextActive, active && activeText ? { color: activeText } : null])}>{text}</ThemedText>
        </Animated.View>
      </Pressable>
    );
  };

  const handleSubmit = () => {
    if (!note.trim()) return;
    // TODO: Persist check-in
    setSubmitted(true);
  };

  const reset = () => {
    setSelectedMood(null);
    setSelectedEnergy(null);
    setSelectedStress(null);
    setNote('');
    setSubmitted(false);
  };

  if (submitted) {
    return (
      <ThemedView style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}> 
        <ThemedText style={{ marginBottom: 8 }}>Thanks for checking in today!</ThemedText>
        <ThemedText style={{ color: palette.muted, textAlign: 'center', marginBottom: 12 }}>
          Your mood has been recorded. Remember that it's okay to not be okay.
        </ThemedText>
        <Button title="Check in again" variant="outline" onPress={reset} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <LinearGradient colors={["#FFFFFF", "#FFFFFF"]} style={styles.pageBackground} pointerEvents="none" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.headerWrap}>
          <View style={styles.headerRow}>
            <View style={styles.headerIcon}>
              <Icon name="sparkles" size={18} color="#7C3AED" />
            </View>
            <ThemedText type="subtitle" style={styles.pageTitle}>Mood Tracker</ThemedText>
          </View>
          <ThemedText style={[styles.pageSubtitle, { color: palette.muted }]}>How are you feeling today?</ThemedText>
        </View>
        <View style={styles.sectionSpacer} />

        {/* Today's Check-in */}
        <Card style={styles.cardShadow}>
          <CardContent style={styles.cardContent}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionTitleIcon}>
                <Icon name="brain" size={18} color="#7C3AED" />
              </View>
              <ThemedText type="subtitle" style={styles.sectionTitle}>Today's Check-in</ThemedText>
            </View>
            <ThemedText style={[styles.helperText, { color: palette.muted }]}>Take a moment to reflect on your current state</ThemedText>

            {/* Mood selection */}
            <ThemedText style={[styles.fieldLabel, styles.fieldLabelGroup]}>How are you feeling right now?</ThemedText>
            <View style={styles.moodGrid}>
              {moods.map((m) => (
                <MoodPillItem key={m.key} emoji={m.emoji} label={m.label} active={selectedMood === m.label} onPress={() => setSelectedMood(m.label)} />
              ))}
            </View>

            {/* Energy level */}
            <ThemedText style={[styles.fieldLabel, styles.fieldLabelGroup]}>What's your energy level?</ThemedText>
            <View style={styles.chipRow}>
              {energies.map((e) => (
                <ChipItem
                  key={e}
                  text={e}
                  active={selectedEnergy === e}
                  onPress={() => setSelectedEnergy(e)}
                  activeBg={energyColors[e]?.bg}
                  activeBorder={energyColors[e]?.border}
                  activeText={energyColors[e]?.text}
                />
              ))}
            </View>

            {/* Stress level */}
            <ThemedText style={[styles.fieldLabel, styles.fieldLabelGroup]}>How stressed do you feel?</ThemedText>
            <View style={styles.chipRow}>
              {stresses.map((s) => (
                <ChipItem
                  key={s}
                  text={s}
                  active={selectedStress === s}
                  onPress={() => setSelectedStress(s)}
                  activeBg={stressColors[s]?.bg}
                  activeBorder={stressColors[s]?.border}
                  activeText={stressColors[s]?.text}
                />
              ))}
            </View>

            {/* Notes */}
            <ThemedText style={[styles.fieldLabel, styles.fieldLabelNotes]}>Any additional thoughts? <ThemedText style={{ fontSize: 14, color: palette.muted }}>(Optional)</ThemedText></ThemedText>
            <Textarea
              placeholder="What's on your mind today? Any specific events or feelings you'd like to note..."
              value={note}
              onChangeText={setNote}
              style={[styles.textarea, { height: 120 }]}
            />

            {/* Footer actions */}
            <View style={styles.footerRow}>
              <View style={styles.privacyRow}>
                <Icon name="check-circle" size={16} color="#10B981" />
                <ThemedText style={[styles.privacyText, { color: palette.muted }]}>Your privacy is protected</ThemedText>
              </View>
              <Button title="Record Mood" onPress={handleSubmit} disabled={!note.trim()} />
            </View>
          </CardContent>
        </Card>

        {/* Weekly summary */}
        <Card style={styles.cardShadow}>
          <CardContent style={styles.cardContent}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionTitleIcon}>
                <Icon name="activity" size={18} color="#10B981" />
              </View>
              <ThemedText type="subtitle" style={styles.sectionTitle}>This Week</ThemedText>
            </View>
            <ThemedText style={[styles.helperText, { color: palette.muted }]}>Your mood journey over the past 7 days</ThemedText>

            <View style={styles.weekRow}>
              {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d, i) => (
                <View key={d} style={styles.weekCol}>
                  <ThemedText style={styles.weekEmoji}>{['😐','🙂','😔','😊','😐','🙂','😊'][i]}</ThemedText>
                  <ThemedText style={[styles.weekLabel, { color: palette.muted }]}>{d}</ThemedText>
                </View>
              ))}
            </View>
          </CardContent>
        </Card>

        {/* Personal Insights */}
        <Card style={styles.cardShadow}>
          <CardContent style={styles.cardContent}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionTitleIcon}>
                <Icon name="target" size={18} color="#F59E0B" />
              </View>
              <ThemedText type="subtitle" style={styles.sectionTitle}>Personal Insights</ThemedText>
            </View>
            <ThemedText style={[styles.helperText, { color: palette.muted }]}>AI-powered patterns from your mood data</ThemedText>

            <View style={styles.insightItem}>
              <View style={[styles.insightIcon, { backgroundColor: '#FEF3C7' }]}>
                <Icon name="sun" size={18} color="#F59E0B" />
              </View>
              <View style={styles.insightTextWrap}>
                <ThemedText style={styles.insightTitle}>Morning Person</ThemedText>
                <ThemedText style={[styles.insightDesc, { color: palette.muted }]}>You tend to feel better in the morning hours</ThemedText>
              </View>
            </View>
            <View style={styles.insightItem}>
              <View style={[styles.insightIcon, { backgroundColor: '#ECFEFF' }]}>
                <Icon name="users" size={18} color="#0EA5E9" />
              </View>
              <View style={styles.insightTextWrap}>
                <ThemedText style={styles.insightTitle}>Social Boost</ThemedText>
                <ThemedText style={[styles.insightDesc, { color: palette.muted }]}>Your mood improves after social interactions</ThemedText>
              </View>
            </View>
            <View style={styles.insightItem}>
              <View style={[styles.insightIcon, { backgroundColor: '#ECFDF5' }]}>
                <Icon name="activity" size={18} color="#16A34A" />
              </View>
              <View style={styles.insightTextWrap}>
                <ThemedText style={styles.insightTitle}>Exercise Impact</ThemedText>
                <ThemedText style={[styles.insightDesc, { color: palette.muted }]}>Physical activity positively affects your wellbeing</ThemedText>
              </View>
            </View>
          </CardContent>
        </Card>

        {/* Achievements */}
        <Card style={styles.cardShadow}>
          <CardContent style={styles.cardContent}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionTitleIcon}>
                <Icon name="star" size={18} color="#F59E0B" />
              </View>
              <ThemedText type="subtitle" style={styles.sectionTitle}>Mood Achievements</ThemedText>
            </View>
            <View style={styles.achievementItem}>
              <View style={[styles.achievementBadge, { backgroundColor: '#F3F4F6' }]}>
                <Icon name="award" size={18} color="#F59E0B" />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.achievementTitle}>7-Day Streak</ThemedText>
                <ThemedText style={[styles.achievementDesc, { color: palette.muted }]}>Consistent daily check-ins</ThemedText>
              </View>
              <ThemedText style={styles.achievementStatus}>Unlocked</ThemedText>
            </View>
            <View style={styles.achievementItem}>
              <View style={[styles.achievementBadge, { backgroundColor: '#F8FAFC' }]}>
                <Icon name="award" size={18} color="#6B7280" />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.achievementTitle}>Mood Master</ThemedText>
                <ThemedText style={[styles.achievementDesc, { color: palette.muted }]}>Track mood for 30 days</ThemedText>
              </View>
              <ThemedText style={[styles.achievementStatus, { color: '#9CA3AF' }]}>Locked</ThemedText>
            </View>
            <View style={styles.achievementItem}>
              <View style={[styles.achievementBadge, { backgroundColor: '#F8FAFC' }]}>
                <Icon name="award" size={18} color="#6B7280" />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.achievementTitle}>Wellness Warrior</ThemedText>
                <ThemedText style={[styles.achievementDesc, { color: palette.muted }]}>Maintain 4+ average for a week</ThemedText>
              </View>
              <ThemedText style={[styles.achievementStatus, { color: '#9CA3AF' }]}>Locked</ThemedText>
            </View>
          </CardContent>
        </Card>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  pageBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 32,
  },
  headerWrap: { gap: 4, alignItems: 'center', marginTop: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' },
  headerIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageTitle: { fontSize: 22, fontFamily: 'Inter_700Bold', color: '#111827', textAlign: 'center' },
  pageSubtitle: { fontSize: 14, textAlign: 'center' },
  headerAccent: { marginTop: 6, height: 4, width: 120, borderRadius: 2, alignSelf: 'center', overflow: 'hidden' },
  headerAccentGradient: { flex: 1, borderRadius: 2 },
  sectionSpacer: { height: 16 },

  cardContent: { padding: 20, gap: 2 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 0 },
  sectionTitleIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold', color: '#111827' },
  helperText: { fontSize: 13, marginTop: 0, marginBottom: 2 },
  fieldLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold', marginTop: 6 },
  fieldLabelGroup: { marginBottom: 8 },
  fieldLabelNotes: { marginBottom: 8 },

  moodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6, marginBottom: 8 },
  moodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  moodPillActive: { backgroundColor: '#EEF2FF', borderColor: '#C7D2FE' },
  moodPillPressed: { opacity: 0.95 },
  moodEmoji: { fontSize: 18 },
  moodPillLabel: { fontSize: 13 },
  moodPillLabelActive: { fontFamily: 'Inter_600SemiBold' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6, marginBottom: 8 },
  chipRing: { borderRadius: 999 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  chipActive: { backgroundColor: '#EEF2FF', borderColor: '#C7D2FE' },
  chipPressed: { opacity: 0.95 },
  chipText: { fontSize: 13 },
  chipTextActive: { fontFamily: 'Inter_600SemiBold' },
  textarea: { marginBottom: 10 },

  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  privacyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  privacyText: { fontSize: 12 },

  weekRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, marginBottom: 8 },
  weekCol: { alignItems: 'center', width: `${100 / 7}%` },
  weekEmoji: { fontSize: 18 },
  weekLabel: { fontSize: 11, marginTop: 2 },
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  progressLabel: { fontSize: 12 },
  progressValue: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  progressBar: { height: 8, backgroundColor: '#E5E7EB', borderRadius: 6, overflow: 'hidden' },
  progressFill: { height: 8, backgroundColor: '#7C3AED', borderRadius: 6 },

  insightItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  insightIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  insightTextWrap: { flex: 1 },
  insightTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#111827' },
  insightDesc: { fontSize: 13 },

  achievementItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  achievementBadge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  achievementTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#111827' },
  achievementDesc: { fontSize: 12 },
  achievementStatus: { fontSize: 12, color: '#10B981', fontFamily: 'Inter_600SemiBold' },

  cardShadow: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
});
