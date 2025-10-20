import { ScrollView, View, StyleSheet, Pressable, Platform } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { Colors } from '@/constants/theme'
import { ThemedView } from '@/components/themed-view'
import { ThemedText } from '@/components/themed-text'
import { Card, CardContent } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { Image } from 'expo-image'
import * as Haptics from 'expo-haptics'
import { learnTopics } from './data'

export default function LearnTopicScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const scheme = useColorScheme() ?? 'light'
  const palette = Colors[scheme] as any
  const topic = learnTopics[id as string] ?? { title: 'Topic', subtitle: '', articles: [] }

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
              <Pressable
                key={a.id}
                style={styles.articleCard}
                onPressIn={() => {
                  if (Platform.OS !== 'web') {
                    try { Haptics.selectionAsync() } catch {}
                  }
                }}
                onPress={() => {
                  router.push({ pathname: '/(student)/learn/article/[articleId]', params: { articleId: a.id } })
                }}
              >
                <Image source={{ uri: a.heroImageUrl }} style={styles.articleThumb} contentFit="cover" />
                <View style={styles.articleBody}>
                  <View style={styles.articleMetaRow}>
                    <View style={[styles.chip, { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' }]}>
                      <ThemedText style={styles.chipText}>{a.level}</ThemedText>
                    </View>
                    <View style={[styles.chip, { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' }]}>
                      <ThemedText style={styles.chipText}>{a.mins} min</ThemedText>
                    </View>
                  </View>
                  <View style={styles.tagRow}>
                    {a.tags.slice(0, 3).map((tag) => (
                      <View key={tag} style={[styles.chip, { backgroundColor: '#EEF2FF', borderColor: '#C7D2FE' }]}>
                        <ThemedText style={[styles.chipText, { color: '#4338CA' }]}>{tag}</ThemedText>
                      </View>
                    ))}
                  </View>
                  <ThemedText type="subtitle" style={styles.articleTitle}>{a.title}</ThemedText>
                  <ThemedText style={[styles.articleDesc, { color: palette.muted }]} numberOfLines={2}>{a.summary}</ThemedText>
                </View>
                <View style={styles.bookmarkWrap}>
                  <Icon name="arrow-right" size={18} color={palette.text} />
                </View>
              </Pressable>
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
  articleThumb: { height: 160, backgroundColor: '#F3F4F6' },
  articleBody: { padding: 16, gap: 8 },
  articleMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999, borderWidth: 1 },
  chipText: { fontSize: 12 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  articleTitle: { color: '#111827' },
  articleDesc: { fontSize: 13 },
  bookmarkWrap: { position: 'absolute', top: 10, right: 10, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFFEE', borderWidth: 1, borderColor: '#E5E7EB' },
})
