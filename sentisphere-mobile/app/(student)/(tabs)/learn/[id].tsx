import { ScrollView, View, StyleSheet, Pressable, Platform, Animated, Easing } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { useRef, useEffect, useCallback } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { Colors } from '@/constants/theme'
import { ThemedView } from '@/components/themed-view'
import { ThemedText } from '@/components/themed-text'
import { GlobalScreenWrapper } from '@/components/GlobalScreenWrapper'
import { Icon } from '@/components/ui/icon'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import * as Haptics from 'expo-haptics'
import { learnTopics } from './data'

export default function LearnTopicScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const scheme = useColorScheme() ?? 'light'
  const palette = Colors[scheme] as any
  const topic = learnTopics[id as string] ?? { title: 'Topic', subtitle: '', articles: [] }

  // Entrance animations
  const entranceHeader = useRef(new Animated.Value(0)).current
  const entranceList = useRef(new Animated.Value(0)).current

  const runEntrance = useCallback(() => {
    entranceHeader.setValue(0)
    entranceList.setValue(0)
    Animated.stagger(80, [
      Animated.timing(entranceHeader, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(entranceList, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start()
  }, [])

  useEffect(() => { runEntrance() }, [])
  useFocusEffect(useCallback(() => { runEntrance(); return () => {} }, []))

  const makeFadeUp = (v: Animated.Value) => ({
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
  })

  const onBack = () => {
    if (Platform.OS !== 'web') {
      try { Haptics.selectionAsync() } catch {}
    }
    router.replace('/(student)/(tabs)/learn')
  }

  return (
    <GlobalScreenWrapper backgroundColor="#FFFFFF">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <Animated.View style={makeFadeUp(entranceHeader)}>
          <Pressable onPress={onBack} style={styles.backRow} accessibilityRole="button">
            <View style={styles.backBtn}>
              <Icon name="arrow-left" size={18} color="#111827" />
            </View>
            <ThemedText style={styles.backText}>Back to Topics</ThemedText>
          </Pressable>

          <View style={styles.headerSection}>
            <ThemedText type="title" style={styles.title}>{topic.title}</ThemedText>
            {!!topic.subtitle && (
              <ThemedText style={styles.subtitle}>{topic.subtitle}</ThemedText>
            )}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Icon name="book-open" size={16} color="#0D8C4F" />
                <ThemedText style={styles.statText}>{topic.articles.length} Articles</ThemedText>
              </View>
              <View style={styles.statItem}>
                <Icon name="clock" size={16} color="#6366F1" />
                <ThemedText style={styles.statText}>
                  {topic.articles.reduce((sum, a) => sum + (a.mins ?? 0), 0)} min total
                </ThemedText>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Article List */}
        <Animated.View style={[styles.articleList, makeFadeUp(entranceList)]}>
          {topic.articles.map((a, index) => (
            <Pressable
              key={a.id}
              style={({ pressed }) => [styles.articleCard, pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 }]}
              onPressIn={() => {
                if (Platform.OS !== 'web') {
                  try { Haptics.selectionAsync() } catch {}
                }
              }}
              onPress={() => {
                router.push({ pathname: '/(student)/learn/article/[articleId]', params: { articleId: a.id } })
              }}
            >
              {/* Hero Image with Gradient Overlay */}
              <View style={styles.imageContainer}>
                <Image source={{ uri: a.heroImageUrl }} style={styles.articleThumb} contentFit="cover" />
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.6)']}
                  style={styles.imageGradient}
                />
                {/* Level Badge on Image */}
                <View style={styles.levelBadge}>
                  <ThemedText style={styles.levelText}>{a.level}</ThemedText>
                </View>
                {/* Reading Time on Image */}
                <View style={styles.timeBadge}>
                  <Icon name="clock" size={12} color="#FFFFFF" />
                  <ThemedText style={styles.timeText}>{a.mins} min</ThemedText>
                </View>
              </View>

              {/* Content */}
              <View style={styles.articleBody}>
                {/* Tags */}
                <View style={styles.tagRow}>
                  {a.tags.slice(0, 2).map((tag) => (
                    <View key={tag} style={styles.tagChip}>
                      <ThemedText style={styles.tagText}>{tag}</ThemedText>
                    </View>
                  ))}
                </View>

                {/* Title & Summary */}
                <ThemedText style={styles.articleTitle} numberOfLines={2}>{a.title}</ThemedText>
                <ThemedText style={styles.articleDesc} numberOfLines={2}>{a.summary}</ThemedText>

                {/* Footer */}
                <View style={styles.articleFooter}>
                  <View style={styles.readMore}>
                    <ThemedText style={styles.readMoreText}>Read Article</ThemedText>
                    <Icon name="arrow-right" size={14} color="#0D8C4F" />
                  </View>
                </View>
              </View>
            </Pressable>
          ))}
        </Animated.View>
      </ScrollView>
    </GlobalScreenWrapper>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  
  // Back Button
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  backBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 14, fontFamily: 'Inter_500Medium', color: '#6B7280' },
  
  // Header
  headerSection: { marginBottom: 24 },
  title: { fontSize: 26, fontFamily: 'Inter_700Bold', color: '#111827', marginBottom: 6 },
  subtitle: { fontSize: 14, lineHeight: 20, color: '#6B7280', marginBottom: 16 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: '#374151' },
  
  // Article List
  articleList: { gap: 16 },
  
  // Article Card
  articleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  
  // Image Section
  imageContainer: { position: 'relative', height: 140 },
  articleThumb: { width: '100%', height: '100%', backgroundColor: '#F3F4F6' },
  imageGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 60 },
  levelBadge: { 
    position: 'absolute', 
    top: 12, 
    left: 12, 
    backgroundColor: '#FFFFFF', 
    paddingVertical: 4, 
    paddingHorizontal: 10, 
    borderRadius: 999 
  },
  levelText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: '#374151' },
  timeBadge: { 
    position: 'absolute', 
    bottom: 12, 
    right: 12, 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  timeText: { fontSize: 11, fontFamily: 'Inter_500Medium', color: '#FFFFFF' },
  
  // Content Section
  articleBody: { padding: 14, gap: 8 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagChip: { 
    backgroundColor: '#ECFDF5', 
    paddingVertical: 4, 
    paddingHorizontal: 10, 
    borderRadius: 999 
  },
  tagText: { fontSize: 11, fontFamily: 'Inter_500Medium', color: '#0D8C4F' },
  articleTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#111827', lineHeight: 22 },
  articleDesc: { fontSize: 13, color: '#6B7280', lineHeight: 18 },
  
  // Footer
  articleFooter: { marginTop: 4 },
  readMore: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  readMoreText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#0D8C4F' },
})
