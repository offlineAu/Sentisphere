import { useMemo, useRef, useEffect, useCallback } from 'react'
import { ScrollView, View, StyleSheet, Pressable, Linking, Platform, Animated, Easing, Share } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { useFocusEffect } from '@react-navigation/native'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { Colors } from '@/constants/theme'
import { LinearGradient } from 'expo-linear-gradient'
import { Image } from 'expo-image'
import { Icon } from '@/components/ui/icon'
import { ThemedView } from '@/components/themed-view'
import { ThemedText } from '@/components/themed-text'
import { GlobalScreenWrapper } from '@/components/GlobalScreenWrapper'
import { getArticleById, getArticleNeighbors } from '../data'
import { Feather } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'

export default function LearnArticleScreen() {
  const { articleId } = useLocalSearchParams<{ articleId: string }>()
  const scheme = useColorScheme() ?? 'light'
  const palette = Colors[scheme] as any
  const lookup = useMemo(() => getArticleById(articleId ?? ''), [articleId])
  const neighbors = useMemo(() => getArticleNeighbors(articleId ?? ''), [articleId])

  const article = lookup?.article
  const topic = lookup?.topic
  const topicId = lookup?.topicId ?? null

  // ScrollView ref for scroll to top
  const scrollRef = useRef<ScrollView>(null)

  // Entrance animations
  const entranceHero = useRef(new Animated.Value(0)).current
  const entranceContent = useRef(new Animated.Value(0)).current

  const runEntrance = useCallback(() => {
    entranceHero.setValue(0)
    entranceContent.setValue(0)
    Animated.stagger(100, [
      Animated.timing(entranceHero, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(entranceContent, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start()
  }, [])

  useEffect(() => { 
    // Scroll to top when article changes
    scrollRef.current?.scrollTo({ y: 0, animated: true })
    runEntrance() 
  }, [articleId])
  useFocusEffect(useCallback(() => { runEntrance(); return () => {} }, []))

  const makeFadeUp = (v: Animated.Value) => ({
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [15, 0] }) }],
  })

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

  const onShare = async () => {
    if (Platform.OS !== 'web') {
      try { Haptics.selectionAsync() } catch {}
    }
    try {
      await Share.share({
        message: `Check out this article: ${article?.title}`,
        title: article?.title,
      })
    } catch {}
  }

  const navigateToArticle = (id: string) => {
    if (Platform.OS !== 'web') {
      try { Haptics.selectionAsync() } catch {}
    }
    // Scroll to top immediately
    scrollRef.current?.scrollTo({ y: 0, animated: false })
    // Navigate using replace to stay on same screen stack
    router.replace({ pathname: '/(student)/learn/article/[articleId]', params: { articleId: id } })
  }

  if (!article || !topic) {
    return (
      <GlobalScreenWrapper backgroundColor="#FFFFFF" style={{ alignItems: 'center', justifyContent: 'center' }}> 
        <View style={styles.notFoundWrap}>
          <Icon name="book-open" size={48} color="#9CA3AF" />
          <ThemedText style={styles.notFoundText}>Article not found</ThemedText>
          <Pressable onPress={onBack} style={styles.notFoundBtn}>
            <ThemedText style={styles.notFoundBtnText}>Go Back</ThemedText>
          </Pressable>
        </View>
      </GlobalScreenWrapper>
    )
  }

  const heroGradient = [
    'rgba(0, 0, 0, 0.1)',
    'rgba(0, 0, 0, 0.4)',
    'rgba(0, 0, 0, 0.75)',
  ] as const

  // Calculate reading progress indicator width
  const totalReadTime = article.mins

  return (
    <GlobalScreenWrapper backgroundColor="#FFFFFF" topPadding={0}>
      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Header with Back & Share */}
        <View style={styles.header}>
          <Pressable style={styles.headerBtn} onPress={onBack}>
            <Icon name="arrow-left" size={20} color="#111827" />
          </Pressable>
          <Pressable style={styles.headerBtn} onPress={onShare}>
            <Icon name="share-2" size={20} color="#111827" />
          </Pressable>
        </View>

        {/* Hero Section */}
        <Animated.View style={[styles.heroWrap, makeFadeUp(entranceHero)]}>
          <Image source={{ uri: article.heroImageUrl }} style={styles.heroImage} contentFit="cover" />
          <LinearGradient colors={heroGradient} style={StyleSheet.absoluteFillObject as any} />
          
          {/* Badges on Hero */}
          <View style={styles.heroBadges}>
            <View style={styles.levelBadge}>
              <Icon name="award" size={12} color="#111827" />
              <ThemedText style={styles.levelText}>{article.level}</ThemedText>
            </View>
            <View style={styles.timeBadge}>
              <Icon name="clock" size={12} color="#FFFFFF" />
              <ThemedText style={styles.timeText}>{article.mins} min read</ThemedText>
            </View>
          </View>

          {/* Hero Content */}
          <View style={styles.heroContent}>
            <View style={styles.tagRow}>
              {article.tags.slice(0, 3).map((tag) => (
                <View key={tag} style={styles.tagChip}>
                  <ThemedText style={styles.tagChipText}>{tag}</ThemedText>
                </View>
              ))}
            </View>
            <ThemedText style={styles.heroTitle}>{article.title}</ThemedText>
          </View>
        </Animated.View>

        {/* Author Card */}
        <Animated.View style={[styles.authorCard, makeFadeUp(entranceContent)]}>
          <View style={styles.authorAvatar}>
            <Icon name="user" size={18} color="#0D8C4F" />
          </View>
          <View style={styles.authorInfo}>
            <ThemedText style={styles.authorName}>{article.author}</ThemedText>
            <ThemedText style={styles.authorSource}>{article.source}</ThemedText>
          </View>
          <View style={styles.topicBadge}>
            <ThemedText style={styles.topicBadgeText}>{topic.title}</ThemedText>
          </View>
        </Animated.View>

        {/* Summary Card */}
        <Animated.View style={[styles.summaryCard, makeFadeUp(entranceContent)]}>
          <View style={styles.summaryIcon}>
            <Feather name="file-text" size={18} color="#6366F1" />
          </View>
          <ThemedText style={styles.summaryText}>{article.summary}</ThemedText>
        </Animated.View>

        {/* Article Content */}
        <Animated.View style={[styles.contentSection, makeFadeUp(entranceContent)]}>
          {article.content.map((block, index) => {
            if (block.type === 'heading') {
              return (
                <View key={index} style={styles.headingWrap}>
                  <View style={styles.headingAccent} />
                  <ThemedText style={styles.sectionHeading}>{block.text}</ThemedText>
                </View>
              )
            }
            if (block.type === 'list') {
              return (
                <View key={index} style={styles.listWrap}>
                  {block.text ? <ThemedText style={styles.listIntro}>{block.text}</ThemedText> : null}
                  {block.items?.map((item, i) => (
                    <View key={i} style={styles.listItemRow}>
                      <View style={styles.listBullet}>
                        <ThemedText style={styles.listBulletText}>{i + 1}</ThemedText>
                      </View>
                      <ThemedText style={styles.listText}>{item}</ThemedText>
                    </View>
                  ))}
                </View>
              )
            }
            if (block.type === 'tip') {
              return (
                <View key={index} style={styles.tipCard}>
                  <View style={styles.tipIcon}>
                    <Feather name="zap" size={16} color="#F59E0B" />
                  </View>
                  <View style={styles.tipContent}>
                    <ThemedText style={styles.tipLabel}>Pro Tip</ThemedText>
                    <ThemedText style={styles.tipText}>{block.text}</ThemedText>
                  </View>
                </View>
              )
            }
            if (block.type === 'quote') {
              return (
                <View key={index} style={styles.quoteCard}>
                  <View style={{ opacity: 0.5 }}><Icon name="message-circle" size={24} color="#0D8C4F" /></View>
                  <ThemedText style={styles.quoteText}>{block.text}</ThemedText>
                </View>
              )
            }
            if (block.type === 'source') {
              return (
                <Pressable
                  key={index}
                  style={styles.sourceCard}
                  onPress={() => { if (article.sourceUrl) { Linking.openURL(article.sourceUrl).catch(() => {}) } }}
                  onPressIn={() => { if (Platform.OS !== 'web') { try { Haptics.selectionAsync() } catch {} } }}
                >
                  <Feather name="external-link" size={16} color="#6366F1" />
                  <ThemedText style={styles.sourceText}>{block.text}</ThemedText>
                </Pressable>
              )
            }
            // paragraph
            return (
              <ThemedText key={index} style={styles.paragraph}>{block.text}</ThemedText>
            )
          })}
        </Animated.View>

        {/* Navigation to Next Article */}
        {neighbors.next && (
          <Pressable 
            style={styles.nextArticleBtn}
            onPress={() => navigateToArticle(neighbors.next!.article.id)}
          >
            <View style={styles.nextArticleContent}>
              <ThemedText style={styles.nextArticleLabel}>Next Article</ThemedText>
              <ThemedText style={styles.nextArticleTitle} numberOfLines={1}>{neighbors.next.article.title}</ThemedText>
            </View>
            <View style={styles.nextArticleIcon}>
              <Icon name="arrow-right" size={18} color="#FFFFFF" />
            </View>
          </Pressable>
        )}

        {/* Back to Topic Button */}
        <View style={styles.footerSection}>
          <Pressable style={styles.backToTopicBtn} onPress={onBack}>
            <Icon name="arrow-left" size={16} color="#0D8C4F" />
            <ThemedText style={styles.backToTopicText}>Back to {topic.title}</ThemedText>
          </Pressable>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </GlobalScreenWrapper>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  scrollContent: { paddingBottom: 32 },
  
  // Not Found
  notFoundWrap: { alignItems: 'center', gap: 12 },
  notFoundText: { fontSize: 16, color: '#6B7280' },
  notFoundBtn: { marginTop: 8, paddingVertical: 10, paddingHorizontal: 20, backgroundColor: '#F3F4F6', borderRadius: 12 },
  notFoundBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#111827' },
  
  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  headerBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  
  // Hero
  heroWrap: { marginHorizontal: 16, borderRadius: 24, overflow: 'hidden', backgroundColor: '#111827', marginBottom: 16, height: 260 },
  heroImage: { width: '100%', height: '100%' },
  heroBadges: { position: 'absolute', top: 16, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
  levelBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFFFFF', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999 },
  levelText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: '#111827' },
  timeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.5)', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999 },
  timeText: { fontSize: 11, fontFamily: 'Inter_500Medium', color: '#FFFFFF' },
  heroContent: { position: 'absolute', left: 20, right: 20, bottom: 20, gap: 12 },
  heroTitle: { color: '#FFFFFF', fontSize: 24, lineHeight: 30, fontFamily: 'Inter_700Bold' },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  tagChip: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  tagChipText: { color: '#FFFFFF', fontSize: 11, fontFamily: 'Inter_500Medium' },
  
  // Author Card
  authorCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, padding: 14, backgroundColor: '#F9FAFB', borderRadius: 16, gap: 12, marginBottom: 12 },
  authorAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' },
  authorInfo: { flex: 1 },
  authorName: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#111827' },
  authorSource: { fontSize: 12, color: '#6B7280' },
  topicBadge: { backgroundColor: '#EEF2FF', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999 },
  topicBadgeText: { fontSize: 11, fontFamily: 'Inter_500Medium', color: '#4F46E5' },
  
  // Summary Card
  summaryCard: { flexDirection: 'row', marginHorizontal: 16, padding: 16, backgroundColor: '#F5F3FF', borderRadius: 16, gap: 12, marginBottom: 20 },
  summaryIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center' },
  summaryText: { flex: 1, fontSize: 14, lineHeight: 21, color: '#374151', fontStyle: 'italic' },
  
  // Content
  contentSection: { paddingHorizontal: 16, gap: 20 },
  paragraph: { fontSize: 16, lineHeight: 26, color: '#374151' },
  
  // Heading
  headingWrap: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  headingAccent: { width: 4, height: 24, borderRadius: 2, backgroundColor: '#0D8C4F' },
  sectionHeading: { fontSize: 20, fontFamily: 'Inter_700Bold', color: '#111827' },
  
  // List
  listWrap: { gap: 12 },
  listIntro: { fontSize: 15, lineHeight: 23, color: '#374151' },
  listItemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  listBullet: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  listBulletText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#0D8C4F' },
  listText: { flex: 1, fontSize: 15, lineHeight: 23, color: '#374151' },
  
  // Tip Card
  tipCard: { flexDirection: 'row', backgroundColor: '#FFFBEB', borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: '#FEF3C7' },
  tipIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' },
  tipContent: { flex: 1, gap: 4 },
  tipLabel: { fontSize: 12, fontFamily: 'Inter_700Bold', color: '#D97706', textTransform: 'uppercase', letterSpacing: 0.5 },
  tipText: { fontSize: 14, lineHeight: 21, color: '#92400E' },
  
  // Quote Card
  quoteCard: { backgroundColor: '#ECFDF5', borderRadius: 16, padding: 20, gap: 12, borderLeftWidth: 4, borderLeftColor: '#0D8C4F' },
  quoteText: { fontSize: 16, lineHeight: 26, color: '#065F46', fontStyle: 'italic' },
  
  // Source Card
  sourceCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#EEF2FF', borderRadius: 12, padding: 14 },
  sourceText: { flex: 1, fontSize: 13, color: '#4F46E5' },
  
  // Next Article Button
  nextArticleBtn: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginHorizontal: 16, 
    marginTop: 32, 
    padding: 16, 
    backgroundColor: 'rgba(13, 140, 79, 0.12)', 
    borderRadius: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(13, 140, 79, 0.2)',
  },
  nextArticleContent: { flex: 1 },
  nextArticleLabel: { fontSize: 12, color: '#6B7280', marginBottom: 2 },
  nextArticleTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#0D8C4F' },
  nextArticleIcon: { 
    width: 36, 
    height: 36, 
    borderRadius: 18, 
    backgroundColor: '#0D8C4F', 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  
  // Footer
  footerSection: { marginHorizontal: 16, marginTop: 24 },
  backToTopicBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, backgroundColor: '#ECFDF5', borderRadius: 14 },
  backToTopicText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#0D8C4F' },
})
