import { ScrollView, View, StyleSheet, Pressable, Platform } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { Colors } from '@/constants/theme'
import { ThemedView } from '@/components/themed-view'
import { ThemedText } from '@/components/themed-text'
import { Card, CardContent } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import * as Haptics from 'expo-haptics'

const data: Record<string, { title: string; subtitle: string; articles: Array<{ id: string; title: string; summary: string; level: string; mins: number }> }> = {
  'stress-management': {
    title: 'Stress Management',
    subtitle: "Learn effective techniques to reduce and manage stress in your daily life.",
    articles: [
      { id: 'a1', level: 'Beginner', mins: 8, title: "Understanding Stress: Your Body's Response", summary: 'Learn about the physiological and psychological aspects of the stress response.' },
      { id: 'a2', level: 'Beginner', mins: 6, title: '5 Breathing Techniques for Immediate Stress Relief', summary: 'Simple breathing exercises you can do anywhere to calm your nervous system.' },
      { id: 'a3', level: 'Beginner', mins: 7, title: 'Progressive Muscle Relaxation', summary: 'Step-by-step guide to release tension held in the body.' },
      { id: 'a4', level: 'Intermediate', mins: 9, title: 'Cognitive Reframing', summary: 'Techniques to reframe unhelpful thoughts that amplify stress.' },
      { id: 'a5', level: 'Intermediate', mins: 10, title: 'Timeboxing for Students', summary: 'Reduce overwhelm and procrastination with a simple time plan.' },
      { id: 'a6', level: 'Advanced', mins: 12, title: 'Building a Personal Stress Plan', summary: 'Create a sustainable routine with stress buffers that fit your life.' },
    ],
  },
  'mindfulness-meditation': {
    title: 'Mindfulness & Meditation',
    subtitle: 'Build attention and calm through small, repeatable practices.',
    articles: [
      { id: 'm1', level: 'Beginner', mins: 6, title: 'One-Minute Mindfulness', summary: 'A tiny practice to reset during the day.' },
      { id: 'm2', level: 'Beginner', mins: 8, title: 'Body Scan Basics', summary: 'Gently notice sensations from head to toe.' },
    ],
  },
  'sleep-rest': {
    title: 'Sleep & Rest',
    subtitle: 'Habits and science-backed tips for better sleep.',
    articles: [
      { id: 's1', level: 'Beginner', mins: 7, title: 'Sleep Foundations', summary: 'Circadian rhythm, sleep pressure and why they matter.' },
    ],
  },
  'academic-success': {
    title: 'Academic Success',
    subtitle: 'Tactics to learn better, manage time, and reduce study stress.',
    articles: [
      { id: 'ac1', level: 'Beginner', mins: 9, title: 'Active Recall 101', summary: 'Study smarter with simple retrieval practice.' },
    ],
  },
}

export default function LearnTopicScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const scheme = useColorScheme() ?? 'light'
  const palette = Colors[scheme] as any
  const topic = data[id as string] ?? { title: 'Topic', subtitle: '', articles: [] }

  const onBack = () => {
    if (Platform.OS !== 'web') {
      try { Haptics.selectionAsync() } catch {}
    }
    router.replace('/(student)/(tabs)/learn')
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Pressable onPress={onBack} style={styles.backRow} accessibilityRole="button">
          <Icon name="arrow-left" size={16} color={palette.text} />
          <ThemedText style={styles.backText}>Back to Topics</ThemedText>
        </Pressable>

        <ThemedText type="title" style={styles.title}>{topic.title}</ThemedText>
        {!!topic.subtitle && (
          <ThemedText style={[styles.subtitle, { color: palette.muted }]}>{topic.subtitle}</ThemedText>
        )}

        <View style={{ height: 12 }} />
        <Card>
          <CardContent style={{ gap: 8 }}>
            <ThemedText type="subtitle">Articles</ThemedText>
            <ThemedText style={{ color: palette.muted }}>{topic.articles.length} articles to explore</ThemedText>
            <View style={{ height: 6 }} />
            {topic.articles.map((a) => (
              <View key={a.id} style={styles.articleCard}>
                <View style={styles.articleThumb} />
                <View style={styles.articleBody}>
                  <View style={styles.articleMetaRow}>
                    <View style={[styles.chip, { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' }]}>
                      <ThemedText style={styles.chipText}>{a.level}</ThemedText>
                    </View>
                    <View style={[styles.chip, { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' }]}>
                      <ThemedText style={styles.chipText}>{a.mins} min</ThemedText>
                    </View>
                  </View>
                  <ThemedText type="subtitle" style={styles.articleTitle}>{a.title}</ThemedText>
                  <ThemedText style={[styles.articleDesc, { color: palette.muted }]} numberOfLines={2}>{a.summary}</ThemedText>
                </View>
                <View style={styles.bookmarkWrap}>
                  <Icon name="bookmark" size={18} color={palette.muted} />
                </View>
              </View>
            ))}
          </CardContent>
        </Card>
      </ScrollView>
    </ThemedView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  scrollContent: { padding: 16, gap: 16, paddingBottom: 32 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backText: { fontSize: 14 },
  title: { fontSize: 28, fontFamily: 'Inter_700Bold', color: '#111827' },
  subtitle: { fontSize: 13, lineHeight: 18 },
  articleCard: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
  },
  articleThumb: { height: 120, backgroundColor: '#F3F4F6' },
  articleBody: { padding: 16, gap: 6 },
  articleMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999, borderWidth: 1 },
  chipText: { fontSize: 12 },
  articleTitle: { color: '#111827' },
  articleDesc: { fontSize: 13 },
  bookmarkWrap: { position: 'absolute', top: 10, right: 10, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFFAA', borderWidth: 1, borderColor: '#E5E7EB' },
})
