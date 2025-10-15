import { StyleSheet, View, ScrollView, Pressable, Animated, Easing, Platform } from 'react-native';
import { useState, useRef, useEffect } from 'react';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Icon } from '@/components/ui/icon';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

const stats = [
  { key: 'courses', label: 'Courses\nCompleted', value: '12', icon: 'book-open', bg: '#ECFDF5', color: '#10B981' },
  { key: 'time', label: 'Learning Time\nThis month', value: '24h', icon: 'clock', bg: '#EFF6FF', color: '#2563EB' },
  { key: 'goals', label: 'Goals\nAchieved', value: '8', icon: 'target', bg: '#FEF3C7', color: '#F59E0B' },
  { key: 'rating', label: 'Rating\nAverage', value: '4.8', icon: 'star', bg: '#F5F3FF', color: '#8B5CF6' },
];

type Course = {
  id: string;
  title: string;
  description: string;
  tags: string[];
  lessons: number;
  comments: number;
  image?: any;
};

const courses: Course[] = [
  {
    id: 'stress-management',
    title: 'Stress Management',
    description: 'Learn effective techniques to manage and reduce stress in your daily life',
    tags: ['Design', 'Product'],
    lessons: 12,
    comments: 4,
  },
  {
    id: 'mindfulness-meditation',
    title: 'Mindfulness & Meditation',
    description: 'Discover the power of mindfulness and meditation for calm and focus',
    tags: ['Design', 'Prototype'],
    lessons: 8,
    comments: 4,
  },
  {
    id: 'sleep-rest',
    title: 'Sleep & Rest',
    description: 'Improve your sleep quality and establish healthy sleep habits',
    tags: ['Design', 'Research'],
    lessons: 10,
    comments: 4,
  },
  {
    id: 'academic-success',
    title: 'Academic Success',
    description: 'Navigate academic challenges and reduce study-related stress',
    tags: ['Design', 'Product'],
    lessons: 14,
    comments: 6,
  },
];

const tabs = ['Topics', 'Saved'] as const;

export default function LearnScreen() {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>('Topics');
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme] as any;

  // TODO: Integrate with real user progress store
  const hasInProgress = false; // set based on whether the student has any in-progress learning
  const continueProgress = 75; // replace with actual progress value when integrating

  // Saved topics state (per-session for now)
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  // Saved dialog state + animations
  const [savedDialog, setSavedDialog] = useState<{ title?: string; action: 'saved' | 'removed' } | null>(null);
  const dlgOpacity = useRef(new Animated.Value(0)).current;
  const dlgScale = useRef(new Animated.Value(0.98)).current;
  const dlgTranslateY = useRef(new Animated.Value(8)).current;
  const dlgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showSavedDialog = (payload: { title?: string; action: 'saved' | 'removed' }) => {
    setSavedDialog(payload);
    dlgOpacity.setValue(0);
    dlgScale.setValue(0.98);
    dlgTranslateY.setValue(8);
    Animated.parallel([
      Animated.timing(dlgOpacity, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(dlgScale, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(dlgTranslateY, { toValue: 0, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    if (dlgTimer.current) clearTimeout(dlgTimer.current);
    dlgTimer.current = setTimeout(() => hideSavedDialog(), 1600);
  };
  const hideSavedDialog = () => {
    Animated.parallel([
      Animated.timing(dlgOpacity, { toValue: 0, duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(dlgScale, { toValue: 0.98, duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(dlgTranslateY, { toValue: 6, duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start(() => setSavedDialog(null));
  };
  const onViewSaved = () => {
    hideSavedDialog();
    const savedIdx = tabs.indexOf('Saved');
    if (savedIdx >= 0) onTabChange(savedIdx);
  };

  const toggleSave = (id: string) => {
    const wasSaved = savedIds.has(id);
    const next = new Set(savedIds);
    if (wasSaved) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSavedIds(next);
    const c = courses.find((x) => x.id === id);
    if (wasSaved) {
      if (Platform.OS !== 'web') { try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {} }
      showSavedDialog({ title: c?.title, action: 'removed' });
    } else {
      if (Platform.OS !== 'web') { try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {} }
      showSavedDialog({ title: c?.title, action: 'saved' });
    }
  };

  // Segmented control state (match Journal behavior)
  const [tabIndex, setTabIndex] = useState(0);
  const [segW, setSegW] = useState(0);
  const animTab = useRef(new Animated.Value(0)).current;
  const onTabChange = (nextIndex: number) => {
    if (nextIndex === tabIndex) return;
    setTabIndex(nextIndex);
    setActiveTab(tabs[nextIndex]);
    if (Platform.OS !== 'web') { try { Haptics.selectionAsync(); } catch {} }
    Animated.timing(animTab, {
      toValue: nextIndex,
      duration: 260,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: true,
    }).start();
  };
  const indicatorStyle = (() => {
    const usable = Math.max(0, segW - 8); // 4px left + 4px right padding
    const itemW = usable > 0 ? usable / tabs.length : 0;
    const tx = animTab.interpolate({
      inputRange: tabs.map((_, i) => i),
      outputRange: tabs.map((_, i) => i * itemW),
    });
    const opacity = segW > 0 ? 1 : 0; // hide until measured
    return { width: Math.max(0, itemW - 0.5), transform: [{ translateX: tx }], opacity } as const;
  })();

  // Animate course list on segmented tab change
  const listOpacity = useRef(new Animated.Value(1)).current;
  const listTranslateY = useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    listOpacity.setValue(0);
    listTranslateY.setValue(8);
    Animated.parallel([
      Animated.timing(listOpacity, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(listTranslateY, { toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [tabIndex]);

  const ProgressBar = ({ value }: { value: number }) => (
    <View style={styles.progressBar}>
      <View style={[
        styles.progressFill,
        { width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: palette.learningAccent }
      ]}>
        <LinearGradient
          colors={[palette.learningAccent, palette.learningAccent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFillObject as any}
        />
      </View>
    </View>
  );

  const CourseCard = ({ item, saved, onToggle }: { item: Course; saved: boolean; onToggle: (id: string) => void }) => {
    const scale = useRef(new Animated.Value(1)).current;
    const to = (v: number, d = 120) => Animated.timing(scale, { toValue: v, duration: d, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    const springTo = (v: number) => Animated.spring(scale, { toValue: v, stiffness: 260, damping: 20, mass: 0.6, useNativeDriver: true }).start();
    return (
      <Card>
        <CardContent style={styles.courseContent}>
          <View style={styles.courseHeader}>
            <View style={styles.badgeRow}>
              {item.tags.map((t) => (
                <Badge key={t} style={StyleSheet.flatten([styles.badge, styles.badgeGray])}>{t}</Badge>
              ))}
            </View>
            <Pressable
              accessibilityLabel={saved ? 'Unsave topic' : 'Save topic'}
              hitSlop={8}
              onPress={() => { onToggle(item.id); }}
              onPressIn={() => { if (Platform.OS !== 'web') { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {} } to(1.1, 90); }}
              onPressOut={() => { springTo(1); }}
              style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}
            >
              <Animated.View style={{ transform: [{ scale }] }}>
                <Icon
                  name="bookmark"
                  size={20}
                  color={saved ? palette.learningAccent : palette.muted}
                  fill={saved ? (palette.learningAccent as string) : 'transparent'}
                />
              </Animated.View>
            </Pressable>
          </View>
          <ThemedText type="subtitle" style={styles.courseTitle}>{item.title}</ThemedText>
          <ThemedText style={[styles.courseDesc, { color: palette.muted }]} numberOfLines={2}>{item.description}</ThemedText>
          <View style={styles.courseMeta}>
            <View style={styles.avatarsRow}>
              <View style={[styles.avatar, { backgroundColor: '#111827' }]}><ThemedText style={styles.avatarText}>A</ThemedText></View>
              <View style={[styles.avatar, { backgroundColor: '#4B5563' }]}><ThemedText style={styles.avatarText}>B</ThemedText></View>
              <View style={[styles.avatar, { backgroundColor: '#9CA3AF' }]}><ThemedText style={styles.avatarText}>+</ThemedText></View>
            </View>
            <View style={styles.metaRight}>
              <View style={styles.metaItem}><Icon name="message-circle" size={16} color={palette.muted} /><ThemedText style={[styles.metaText, { color: palette.muted }]}>{item.comments}</ThemedText></View>
              <View style={styles.metaItem}><Icon name="book-open" size={16} color={palette.muted} /><ThemedText style={[styles.metaText, { color: palette.muted }]}>{item.lessons}</ThemedText></View>
            </View>
          </View>
          <Button title="Start Learning" />
        </CardContent>
      </Card>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.headerWrap}>
          <View style={styles.headerIcon}>
            <Icon name="book-open" size={18} color={palette.muted} />
          </View>
          <ThemedText type="title" style={styles.pageTitle}>Learn & Grow</ThemedText>
          <ThemedText style={[styles.pageSubtitle, { color: palette.muted }]}>Expand your knowledge with our comprehensive mental wellness courses and resources</ThemedText>
        </View>

        {/* Continue Learning */}
        {hasInProgress && (
          <>
            <View style={styles.sectionSpacer} />
            <View style={styles.continueHeaderRow}>
              <Icon name="clock" size={18} color={palette.muted} />
              <ThemedText type="subtitle" style={styles.sectionTitle}>Continue Learning</ThemedText>
            </View>
            <ThemedText style={[styles.sectionSub, { color: palette.muted }]}>Pick up where you left off</ThemedText>
            <Card>
              <View>
                <Image source={require('@/assets/images/peaceful-mindfulness-meditation.png')} style={styles.heroImage} contentFit="cover" />
                <View style={styles.progressOverlay}><ProgressBar value={continueProgress} /></View>
              </View>
              <CardContent style={styles.courseContent}>
                <ThemedText type="subtitle" style={styles.courseTitle}>Introduction to Mindfulness Meditation</ThemedText>
                <ThemedText style={[styles.courseDesc, { color: palette.muted }]} numberOfLines={2}>Learn the basics of mindfulness and how it can help reduce stress and anxiety in your daily life.</ThemedText>
                <View style={styles.metaRowWrap}>
                  <View style={styles.metaItem}><Icon name="clock" size={16} color={palette.muted} /><ThemedText style={[styles.metaText, { color: palette.muted }]}>10 min read</ThemedText></View>
                  <View style={styles.metaItem}><Icon name="users" size={16} color={palette.muted} /><ThemedText style={[styles.metaText, { color: palette.muted }]}>1,247 enrolled</ThemedText></View>
                  <View style={styles.metaItem}><Icon name="award" size={16} color={palette.muted} /><ThemedText style={[styles.metaText, { color: palette.muted }]}>Beginner</ThemedText></View>
                </View>
                <Button title="Continue Reading" />
              </CardContent>
            </Card>
          </>
        )}

        {/* Search */}
        <View style={styles.searchRow}>
          <Input placeholder="Search topics, articles, or keywords..." style={styles.searchInput} />
          <Pressable accessibilityLabel="Search options" style={styles.searchAction}>
            <Icon name="sparkles" size={18} color="#111827" />
          </Pressable>
        </View>

        {/* Segmented tabs (same as Journal) */}
        <View
          style={[styles.segment, { backgroundColor: '#EEF2F7', borderColor: palette.border, marginTop: 6 }]}
          onLayout={(e) => setSegW(e.nativeEvent.layout.width)}
        >
          <Animated.View pointerEvents="none" style={[styles.segmentIndicator, { backgroundColor: '#ffffff' }, indicatorStyle]} />
          {tabs.map((t, idx) => (
            <Pressable
              key={t}
              style={styles.segmentItem}
              onPress={() => onTabChange(idx)}
              accessibilityRole="button"
              accessibilityState={tabIndex === idx ? { selected: true } : {}}
            >
              <ThemedText style={styles.segmentText}>{t}</ThemedText>
            </Pressable>
          ))}
        </View>

        {/* Course list (segmented) */}
        <Animated.View style={[styles.listWrap, { opacity: listOpacity, transform: [{ translateY: listTranslateY }] }]}>
          {(
            activeTab === 'Saved'
              ? courses.filter((c) => savedIds.has(c.id))
              : courses
            ).length === 0 && activeTab === 'Saved' ? (
              <View style={{ alignItems: 'center', paddingVertical: 16, gap: 6 }}>
                <Icon name="book-open" size={22} color={palette.muted} />
                <ThemedText style={[styles.emptyText, { color: palette.muted }]}>No saved topics yet</ThemedText>
              </View>
            ) : (
              (activeTab === 'Saved' ? courses.filter((c) => savedIds.has(c.id)) : courses).map((c) => (
                <CourseCard key={c.id} item={c} saved={savedIds.has(c.id)} onToggle={toggleSave} />
              ))
            )
          }
        </Animated.View>



        
      </ScrollView>

      {/* Saved confirmation dialog */}
      {savedDialog && (
        <Animated.View
          pointerEvents="auto"
          style={[
            styles.savedDialogWrap,
            { opacity: dlgOpacity, transform: [{ translateY: dlgTranslateY }, { scale: dlgScale }] },
          ]}
        >
          <Pressable
            accessibilityLabel={savedDialog.action === 'saved' ? 'View saved topics' : 'Dismiss notification'}
            onPress={() => {
              if (Platform.OS !== 'web') { try { Haptics.selectionAsync(); } catch {} }
              savedDialog.action === 'saved' ? onViewSaved() : hideSavedDialog();
            }}
            style={styles.savedDialogCard}
          >
            <View
              style={[
                styles.savedDialogIcon,
                savedDialog.action === 'removed'
                  ? { backgroundColor: '#FEE2E2' }
                  : { backgroundColor: palette.learningAccent },
              ]}
            >
              <Icon
                name="bookmark"
                size={14}
                color={savedDialog.action === 'removed' ? '#B91C1C' : '#FFFFFF'}
              />
            </View>
            <View style={styles.savedDialogTextWrap}>
              <ThemedText
                style={[
                  styles.savedDialogTitle,
                  savedDialog.action === 'removed' ? { color: '#B91C1C' } : null,
                ]}
              >
                {savedDialog.action === 'removed' ? 'Removed' : 'Saved'}
              </ThemedText>
              {!!savedDialog.title && (
                <ThemedText style={[styles.savedDialogSubtitle, { color: palette.muted }]} numberOfLines={1}>
                  {savedDialog.title}
                </ThemedText>
              )}
            </View>
            {savedDialog.action === 'saved' && (
              <View style={styles.savedDialogAction}>
                <ThemedText style={[styles.savedDialogActionText, { color: palette.learningAccent }]}>View</ThemedText>
                <Icon name="arrow-right" size={14} color={palette.learningAccent} />
              </View>
            )}
          </Pressable>
        </Animated.View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, gap: 16, paddingBottom: 32 },
  headerWrap: { alignItems: 'center', gap: 4, marginTop: 6 },
  headerIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  pageTitle: { fontSize: 28, fontFamily: 'Inter_700Bold', color: '#111827', textAlign: 'center' },
  pageSubtitle: { fontSize: 13, lineHeight: 18, textAlign: 'center', maxWidth: 360 },

  // Stats
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  statItem: { width: '48%' },
  statCard: { width: '48%' },
  statContent: { padding: 14, alignItems: 'center', gap: 4 },
  statIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 18, fontFamily: 'Inter_700Bold', color: '#111827' },
  statLabel: { fontSize: 11, textAlign: 'center', lineHeight: 14 },

  // Search
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchInput: { flex: 1 },
  searchAction: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB' },

  // Segmented control (copied style pattern from Journal)
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
    paddingVertical: 9,
  },
  segmentText: { fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 20 },

  // Course cards
  courseContent: { padding: 20, gap: 10 },
  courseHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badgeRow: { flexDirection: 'row', gap: 8 },
  badge: { paddingVertical: 4, paddingHorizontal: 8 },
  badgeGray: { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' },
  saveBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  saveBtnText: { fontSize: 12 },
  courseTitle: { color: '#111827' },
  courseDesc: { fontSize: 13 },
  courseMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  avatarsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  avatar: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  metaRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 12 },

  // Continue learning
  sectionSpacer: { height: 10 },
  continueHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold', color: '#111827' },
  sectionSub: { fontSize: 13 },
  heroImage: { width: '100%', height: 160 },
  progressOverlay: { position: 'absolute', bottom: 12, left: 12, right: 12 },
  progressBar: { height: 10, backgroundColor: '#E5E7EB', borderRadius: 6, overflow: 'hidden' },
  progressFill: { height: 10, backgroundColor: '#7C3AED', borderRadius: 6 },
  metaRowWrap: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  emptyText: { fontSize: 13 },
  listWrap: { gap: 12 },
  // Saved dialog styles
  savedDialogWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    zIndex: 50,
  },
  savedDialogCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    // subtle shadow
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  savedDialogIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  savedDialogTextWrap: {
    flex: 1,
    gap: 2,
  },
  savedDialogTitle: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: '#111827',
  },
  savedDialogSubtitle: {
    fontSize: 12,
  },
  savedDialogAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 8,
  },
  savedDialogActionText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
});

