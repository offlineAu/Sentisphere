import { StyleSheet, View, ScrollView, Pressable, Animated, Easing, Platform } from 'react-native';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { GlobalScreenWrapper } from '@/components/GlobalScreenWrapper';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Icon } from '@/components/ui/icon';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Link } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import { learnTopics } from './data';
import { BottomToast, ToastType } from '@/components/BottomToast';

const API = process.env.EXPO_PUBLIC_API_URL || 'https://sentisphere-production.up.railway.app';

// Helper to get auth token
const getToken = async () => {
  if (Platform.OS === 'web') {
    try { return (window as any)?.localStorage?.getItem('auth_token') || null; } catch { return null; }
  }
  try { return await SecureStore.getItemAsync('auth_token'); } catch { return null; }
};

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

const deriveTopicTags = (topicArticles: typeof learnTopics[keyof typeof learnTopics]['articles']) => {
  const tagSet = new Set<string>();
  topicArticles.forEach((article) => {
    article.tags.forEach((tag) => tagSet.add(tag));
  });
  const tags = Array.from(tagSet).slice(0, 3);
  if (tags.length > 0) return tags;
  return ['Wellness'];
};

const courses: Course[] = Object.entries(learnTopics).map(([id, topic]) => {
  const totalMins = topic.articles.reduce((sum, article) => sum + (article.mins ?? 0), 0);
  const approxComments = Math.max(2, Math.round(totalMins / 4));
  return {
    id,
    title: topic.title,
    description: topic.subtitle,
    tags: deriveTopicTags(topic.articles),
    lessons: topic.articles.length,
    comments: approxComments,
  };
});

const tabs = ['Topics', 'Saved'] as const;

export default function LearnScreen() {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>('Topics');
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme] as any;

  // Entrance animations
  const entrance = useRef({
    header: new Animated.Value(0),
    search: new Animated.Value(0),
    tabs: new Animated.Value(0),
    list: new Animated.Value(0),
  }).current;

  const runEntrance = useCallback(() => {
    entrance.header.setValue(0);
    entrance.search.setValue(0);
    entrance.tabs.setValue(0);
    entrance.list.setValue(0);
    Animated.stagger(100, [
      Animated.timing(entrance.header, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(entrance.search, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(entrance.tabs, { toValue: 1, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(entrance.list, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    runEntrance();
  }, []);

  useFocusEffect(
    useCallback(() => {
      runEntrance();
      return () => { };
    }, [])
  );

  const makeFadeUp = (v: Animated.Value) => ({
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
  });

  // TODO: Integrate with real user progress store
  const hasInProgress = false; // set based on whether the student has any in-progress learning
  const continueProgress = 75; // replace with actual progress value when integrating

  // Saved topics state - now persisted to backend
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);

  // Load saved resources from backend on mount
  const loadSavedResources = useCallback(async () => {
    try {
      setIsLoadingSaved(true);
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`${API}/api/saved-resources?resource_type=topic`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        const ids = new Set<string>(data.resources?.map((r: any) => r.resource_id) || []);
        setSavedIds(ids);
      }
    } catch (e) {
      console.error('Failed to load saved resources:', e);
    } finally {
      setIsLoadingSaved(false);
    }
  }, []);

  // Load saved resources when screen focuses
  useFocusEffect(
    useCallback(() => {
      loadSavedResources();
      return () => { };
    }, [loadSavedResources])
  );

  // Toast state (using unified BottomToast component)
  const [toastVisible, setToastVisible] = useState(false);
  const [toastText, setToastText] = useState('');
  const [toastType, setToastType] = useState<ToastType>('success');
  const showToast = (text: string, type: ToastType = 'success') => {
    setToastText(text);
    setToastType(type);
    setToastVisible(true);
  };

  const toggleSave = async (id: string) => {
    const wasSaved = savedIds.has(id);
    const c = courses.find((x) => x.id === id);

    // Optimistic update
    const next = new Set(savedIds);
    if (wasSaved) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSavedIds(next);

    // Show haptic feedback and toast
    if (wasSaved) {
      if (Platform.OS !== 'web') { try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch { } }
      showToast('Removed from saved', 'info');
    } else {
      if (Platform.OS !== 'web') { try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch { } }
      showToast('Saved to collection', 'success');
    }

    // Persist to backend
    try {
      const token = await getToken();
      if (!token) return;

      if (wasSaved) {
        // Remove from saved
        await fetch(`${API}/api/saved-resources/${id}?resource_type=topic`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        // Add to saved
        await fetch(`${API}/api/saved-resources`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            resource_type: 'topic',
            resource_id: id,
            title: c?.title,
            metadata: { description: c?.description, tags: c?.tags },
          }),
        });
      }
    } catch (e) {
      console.error('Failed to sync saved resource:', e);
      // Revert optimistic update on error
      if (wasSaved) {
        setSavedIds(prev => new Set([...prev, id]));
      } else {
        setSavedIds(prev => {
          const reverted = new Set(prev);
          reverted.delete(id);
          return reverted;
        });
      }
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
    if (Platform.OS !== 'web') { try { Haptics.selectionAsync(); } catch { } }
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
    const cardScale = useRef(new Animated.Value(1)).current;
    const to = (v: number, d = 120) => Animated.timing(scale, { toValue: v, duration: d, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    const springTo = (v: number) => Animated.spring(scale, { toValue: v, stiffness: 260, damping: 20, mass: 0.6, useNativeDriver: true }).start();
    const cardSpringTo = (v: number) => Animated.spring(cardScale, { toValue: v, stiffness: 300, damping: 20, mass: 0.5, useNativeDriver: true }).start();
    return (
      <Link href={{ pathname: '/(student)/(tabs)/learn/[id]', params: { id: item.id } }} asChild>
        <Pressable
          onPressIn={() => {
            if (Platform.OS !== 'web') { try { Haptics.selectionAsync() } catch { } }
            cardSpringTo(0.98);
          }}
          onPressOut={() => cardSpringTo(1)}
        >
          <Animated.View style={{ transform: [{ scale: cardScale }] }}>
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
                    onPress={(e) => { e.stopPropagation(); onToggle(item.id); }}
                    onPressIn={(e) => {
                      e.stopPropagation();
                      if (Platform.OS !== 'web') { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch { } }
                      to(1.1, 90);
                    }}
                    onPressOut={(e) => { e.stopPropagation(); springTo(1); }}
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
                  <View style={styles.metaItem}><Icon name="message-circle" size={16} color={palette.muted} /><ThemedText style={[styles.metaText, { color: palette.muted }]}>{item.comments}</ThemedText></View>
                  <View style={styles.metaItem}><Icon name="book-open" size={16} color={palette.muted} /><ThemedText style={[styles.metaText, { color: palette.muted }]}>{item.lessons} lessons</ThemedText></View>
                </View>
                <View style={styles.startLearningRow}>
                  <ThemedText style={styles.startLearningText}>Start Learning</ThemedText>
                  <Icon name="arrow-right" size={16} color="#0D8C4F" />
                </View>
              </CardContent>
            </Card>
          </Animated.View>
        </Pressable>
      </Link>
    );
  };

  return (
    <GlobalScreenWrapper backgroundColor="#FFFFFF">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <Animated.View style={[styles.headerWrap, makeFadeUp(entrance.header)]}>
          <Image source={require('@/assets/images/learn-grow.png')} style={styles.headerImage} contentFit="contain" />
          <ThemedText type="title" style={styles.pageTitle}>Learn & Grow</ThemedText>
          <ThemedText style={[styles.pageSubtitle, { color: palette.muted }]}>Expand your knowledge with our comprehensive mental wellness courses and resources</ThemedText>
        </Animated.View>

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

        {/* Segmented tabs (same as Journal) */}
        <Animated.View
          style={[styles.segment, { backgroundColor: '#EEF2F7', borderColor: palette.border, marginTop: 6 }, makeFadeUp(entrance.tabs)]}
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
        </Animated.View>

        {/* Course list (segmented) */}
        <Animated.View style={[styles.listWrap, makeFadeUp(entrance.list), { opacity: Animated.multiply(entrance.list, listOpacity), transform: [{ translateY: listTranslateY }] }]}>
          {(
            activeTab === 'Saved'
              ? courses.filter((c) => savedIds.has(c.id))
              : courses
          ).length === 0 && activeTab === 'Saved' ? (
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 10 }}>
              <Icon name="bookmark" size={32} color="#9CA3AF" />
              <ThemedText style={{ color: '#6B7280', fontSize: 16, fontFamily: 'Inter_600SemiBold', textAlign: 'center' }}>No saved topics yet</ThemedText>
              <ThemedText style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center' }}>Save topics to access them later</ThemedText>
            </View>
          ) : (
            (activeTab === 'Saved' ? courses.filter((c) => savedIds.has(c.id)) : courses).map((c) => (
              <CourseCard key={c.id} item={c} saved={savedIds.has(c.id)} onToggle={toggleSave} />
            ))
          )
          }
        </Animated.View>




      </ScrollView>

      {/* Bottom Toast */}
      <BottomToast
        visible={toastVisible}
        message={toastText}
        type={toastType}
        onHide={() => setToastVisible(false)}
      />
    </GlobalScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, gap: 16, paddingBottom: 120 }, // Account for floating nav bar
  headerWrap: { alignItems: 'center', gap: 8, marginTop: 6 },
  headerIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  headerImage: { width: 48, height: 48 },
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
  courseMeta: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatarsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  avatar: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  metaRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 12 },
  startLearningRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, backgroundColor: 'rgba(13, 140, 79, 0.1)', borderRadius: 12, marginTop: 4 },
  startLearningText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#0D8C4F' },

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
});

