import { StyleSheet, View, ScrollView, Pressable, Animated, Easing } from 'react-native';
import { useState, useRef } from 'react';
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

  // Segmented control state (match Journal behavior)
  const [tabIndex, setTabIndex] = useState(0);
  const [segW, setSegW] = useState(0);
  const animTab = useRef(new Animated.Value(0)).current;
  const onTabChange = (nextIndex: number) => {
    if (nextIndex === tabIndex) return;
    setTabIndex(nextIndex);
    setActiveTab(tabs[nextIndex]);
    try { Haptics.selectionAsync(); } catch {}
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

  const ProgressBar = ({ value }: { value: number }) => (
    <View style={styles.progressBar}>
      <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(100, value))}%` }]}> 
        <LinearGradient colors={["#A78BFA", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFillObject as any} />
      </View>
    </View>
  );

  const CourseCard = ({ item }: { item: Course }) => (
    <Card>
      <CardContent style={styles.courseContent}>
        <View style={styles.courseHeader}>
          <View style={styles.badgeRow}>
            {item.tags.map((t) => (
              <Badge key={t} style={StyleSheet.flatten([styles.badge, styles.badgeGray])}>{t}</Badge>
            ))}
          </View>
          <Pressable hitSlop={8}>
            <Icon name="star" size={18} color={palette.muted} />
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

  return (
    <ThemedView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.headerWrap}>
          <ThemedText type="title" style={styles.pageTitle}>Learn & Grow</ThemedText>
          <ThemedText style={[styles.pageSubtitle, { color: palette.muted }]}>Expand your knowledge with our comprehensive mental wellness courses and resources</ThemedText>
        </View>

        {/* Stats grid */}
        <View style={styles.statsGrid}>
          {stats.map((s) => (
            <View key={s.key} style={styles.statItem}>
              <Card>
                <CardContent style={styles.statContent}>
                  <View style={[styles.statIcon, { backgroundColor: s.bg }]}>
                    <Icon name={s.icon as any} size={16} color={s.color} />
                  </View>
                  <ThemedText style={styles.statValue}>{s.value}</ThemedText>
                  <ThemedText style={[styles.statLabel, { color: palette.muted }]} numberOfLines={2}>
                    {s.label}
                  </ThemedText>
                </CardContent>
              </Card>
            </View>
          ))}
        </View>

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
          <Animated.View style={[styles.segmentIndicator, { backgroundColor: '#ffffff' }, indicatorStyle]} />
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

        {/* Course list */}
        <View style={{ gap: 12 }}>
          {courses.map((c) => (
            <CourseCard key={c.id} item={c} />
          ))}
        </View>

        {/* Continue Learning */}
        <View style={styles.sectionSpacer} />
        <View style={styles.continueHeaderRow}>
          <Icon name="clock" size={18} color={palette.muted} />
          <ThemedText type="subtitle" style={styles.sectionTitle}>Continue Learning</ThemedText>
        </View>
        <ThemedText style={[styles.sectionSub, { color: palette.muted }]}>Pick up where you left off</ThemedText>
        <Card>
          <View>
            <Image source={require('@/assets/images/peaceful-mindfulness-meditation.png')} style={styles.heroImage} contentFit="cover" />
            <View style={styles.progressOverlay}><ProgressBar value={75} /></View>
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
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, gap: 16, paddingBottom: 32 },
  headerWrap: { alignItems: 'center', gap: 6, marginTop: 4 },
  pageTitle: { fontSize: 28, fontFamily: 'Inter_700Bold', color: '#111827', textAlign: 'center' },
  pageSubtitle: { fontSize: 14, textAlign: 'center' },

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
});

