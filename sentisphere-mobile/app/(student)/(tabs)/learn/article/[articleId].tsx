import { useMemo } from 'react'
import { ScrollView, View, StyleSheet, Pressable, Linking, Platform } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { Colors } from '@/constants/theme'
import { LinearGradient } from 'expo-linear-gradient'
import { Image } from 'expo-image'
import { Icon } from '@/components/ui/icon'
import { ThemedView } from '@/components/themed-view'
import { ThemedText } from '@/components/themed-text'
import { getArticleById } from '../data'
import * as Haptics from 'expo-haptics'

export default function LearnArticleScreen() {
  const { articleId } = useLocalSearchParams<{ articleId: string }>()
  const scheme = useColorScheme() ?? 'light'
  const palette = Colors[scheme] as any
  const lookup = useMemo(() => getArticleById(articleId ?? ''), [articleId])

  const article = lookup?.article
  const topic = lookup?.topic
  const topicId = lookup?.topicId ?? null

  const onBack = () => {
    if (Platform.OS !== 'web') {
      try { Haptics.selectionAsync() } catch {}
    }
    if (topicId) {
      router.replace({ pathname: '/(student)/(tabs)/learn/[id]', params: { id: topicId } })
      return
    }
    router.replace('/(student)/(tabs)/learn')
  }

  if (!article || !topic) {
    return (
      <ThemedView style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}> 
        <ThemedText style={{ fontSize: 16 }}>Article not found.</ThemedText>
      </ThemedView>
    )
  }

  const heroGradient = [
    'rgba(17, 24, 39, 0.55)',
    'rgba(17, 24, 39, 0.35)',
    'rgba(17, 24, 39, 0.45)',
  ] as const

  return (
    <ThemedView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Icon name="arrow-left" size={16} color={palette.text} />
          <ThemedText style={styles.backText}>Back</ThemedText>
        </Pressable>

        <View style={styles.heroWrap}>
          <Image source={{ uri: article.heroImageUrl }} style={styles.heroImage} contentFit="cover" />
          <LinearGradient colors={heroGradient} style={StyleSheet.absoluteFillObject as any} />
          <View style={styles.heroContent}>
            <View style={styles.tagRow}>
              {article.tags.slice(0, 2).map((tag) => (
                <View key={tag} style={styles.tagChip}>
                  <ThemedText style={styles.tagChipText}>{tag}</ThemedText>
                </View>
              ))}
            </View>
            <ThemedText type="title" style={styles.heroTitle}>{article.title}</ThemedText>
            <View style={styles.heroMetaRow}>
              <View style={styles.metaAuthorRow}>
                <View style={styles.authorAvatar}>
                  <Icon name="user" size={14} color="#111827" />
                </View>
                <View>
                  <ThemedText style={styles.authorName}>{article.author}</ThemedText>
                  <ThemedText style={[styles.metaText, { color: '#6B7280' }]}>{article.source}</ThemedText>
                </View>
              </View>
              <View style={styles.metaPills}>
                <View style={styles.metaPill}>
                  <Icon name="clock" size={14} color="#111827" />
                  <ThemedText style={styles.metaText}>{article.mins} min</ThemedText>
                </View>
                <View style={styles.metaPill}>
                  <Icon name="award" size={14} color="#111827" />
                  <ThemedText style={styles.metaText}>{article.level}</ThemedText>
                </View>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.contentCard}>
          {article.content.map((block, index) => {
            if (block.type === 'heading') {
              return (
                <ThemedText key={index} type="subtitle" style={styles.sectionHeading}>{block.text}</ThemedText>
              )
            }
            if (block.type === 'list') {
              return (
                <View key={index} style={styles.bulletWrap}>
                  <ThemedText style={styles.listIntro}>{block.text}</ThemedText>
                  {block.items?.map((item, i) => (
                    <View key={i} style={styles.listItemRow}>
                      <View style={styles.listBullet} />
                      <ThemedText style={styles.listText}>{item}</ThemedText>
                    </View>
                  ))}
                </View>
              )
            }
            if (block.type === 'source') {
              return (
                <Pressable
                  key={index}
                  style={styles.sourceRow}
                  onPress={() => { if (article.sourceUrl) { Linking.openURL(article.sourceUrl).catch(() => {}) } }}
                  onPressIn={() => { if (Platform.OS !== 'web') { try { Haptics.selectionAsync() } catch {} } }}
                >
                  <Icon name="share-2" size={16} color={palette.learningAccent ?? '#4F46E5'} />
                  <ThemedText style={[styles.sourceText, { color: palette.learningAccent ?? '#4F46E5' }]}>{block.text}</ThemedText>
                </Pressable>
              )
            }
            return (
              <ThemedText key={index} style={styles.paragraph}>{block.text}</ThemedText>
            )
          })}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </ThemedView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  scrollContent: { paddingBottom: 32 },
  backButton: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 20, gap: 8 },
  backText: { fontSize: 14, color: '#111827' },
  heroWrap: { marginHorizontal: 16, borderRadius: 28, overflow: 'hidden', backgroundColor: '#111827', marginBottom: 24 },
  heroImage: { width: '100%', height: 280 },
  heroContent: { position: 'absolute', left: 20, right: 20, bottom: 26, gap: 16 },
  heroTitle: { color: '#FFFFFF', fontSize: 30, lineHeight: 34, fontFamily: 'Inter_700Bold' },
  heroMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  metaAuthorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  metaPills: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  metaPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB' },
  metaText: { fontSize: 12, color: '#111827' },
  authorAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E5E7EB' },
  authorName: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tagChip: { backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)' },
  tagChipText: { color: '#FFFFFF', fontSize: 12, fontFamily: 'Inter_500Medium' },
  contentCard: { marginHorizontal: 16, borderRadius: 28, padding: 24, gap: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB' },
  paragraph: { fontSize: 16, lineHeight: 24, color: '#111827' },
  sectionHeading: { fontSize: 20, lineHeight: 24, marginTop: 8, color: '#111827' },
  bulletWrap: { gap: 10 },
  listIntro: { fontSize: 16, lineHeight: 22, color: '#111827' },
  listItemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  listBullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#4F46E5', marginTop: 8 },
  listText: { flex: 1, fontSize: 15, lineHeight: 22, color: '#111827' },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  sourceText: { fontSize: 14 },
})
