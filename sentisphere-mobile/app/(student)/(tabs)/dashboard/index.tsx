"use client"

import { StyleSheet, View, ScrollView, Dimensions, Pressable, Animated, Easing, Platform, useWindowDimensions, Share } from "react-native"
import { useEffect, useState, useRef, useCallback } from "react"
import { ThemedView } from "@/components/themed-view"
import { ThemedText } from "@/components/themed-text"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Link } from "expo-router"
import { useColorScheme } from "@/hooks/use-color-scheme"
import { Colors } from "@/constants/theme"
import { Icon } from "@/components/ui/icon"
import { LinearGradient } from "expo-linear-gradient"
import * as Haptics from "expo-haptics"
import { useFocusEffect } from '@react-navigation/native'

const { width } = Dimensions.get("window")
const GRID_PADDING = 16 // matches scrollContent padding
const CARD_CONTENT_PADDING = 20 // matches styles.cardContent padding
const QUICK_GAP = 16 // matches styles.quickGrid.gap
const TILE_WIDTH = (width - GRID_PADDING * 2 - CARD_CONTENT_PADDING * 2 - QUICK_GAP) / 2
const TILE_WIDTH_NATIVE = width < 400 ? ("100%" as const) : ("48%" as const)

interface MoodData {
  date: string
  mood: number
  note?: string
}

interface JournalEntry {
  id: string
  title: string
  date: string
  mood: string
}

export default function EnhancedDashboardScreen() {
  const scheme = useColorScheme() ?? "light"
  const palette = Colors[scheme] as any
  const [now, setNow] = useState(new Date())
  const [journalCount] = useState(12)
  const [weeklyMoodAverage] = useState(7.2)
  const [currentStreak] = useState(5)
  const { width: winWidth } = useWindowDimensions()
  const isNarrow = winWidth < 400
  const tileWidthWeb = (winWidth - GRID_PADDING * 2 - CARD_CONTENT_PADDING * 2 - QUICK_GAP) / 2
  const qaWidthStyle = Platform.select({ web: { width: tileWidthWeb }, default: { width: isNarrow ? "100%" : "48%" } }) as any

  // Feature flags for layout
  const showLegacySections = false
  const showSummaryRow = false

  // Helpers & data
  const formatTimeAgo = (ts: number) => {
    const diff = Math.max(0, now.getTime() - ts)
    const m = Math.floor(diff / 60000)
    if (m < 1) return "just now"
    if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`
    const d = Math.floor(h / 24)
    return `${d} day${d === 1 ? "" : "s"} ago`
  }

  const recentActivity = [
    {
      id: "a1",
      title: "Mood check completed",
      description: "Feeling optimistic today",
      icon: "brain",
      color: "#8B5CF6",
      bg: "#F5F3FF",
      timestamp: Date.now() - 2 * 60 * 60 * 1000,
      href: "/(student)/(tabs)/mood",
    },
    {
      id: "a2",
      title: "Journal entry added",
      description: "Morning Reflections",
      icon: "book-open",
      color: "#16A34A",
      bg: "#ECFDF5",
      timestamp: Date.now() - 6 * 60 * 60 * 1000,
      href: "/(student)/(tabs)/journal",
    },
    {
      id: "a3",
      title: "AI chat started",
      description: "Discussed stress management",
      icon: "message-square",
      color: "#0D9488",
      bg: "#ECFEFF",
      timestamp: Date.now() - 26 * 60 * 60 * 1000,
      href: "/(student)/(tabs)/chat",
    },
  ] as const

  // Sample data - in real app, this would come from your data store
  const [recentMoods] = useState<MoodData[]>([
    { date: "2024-01-15", mood: 8, note: "Feeling productive today" },
    { date: "2024-01-14", mood: 6, note: "Bit tired but okay" },
    { date: "2024-01-13", mood: 9, note: "Great day with friends" },
  ])

  const [recentJournals] = useState<JournalEntry[]>([
    { id: "1", title: "Morning Reflections", date: "2024-01-15", mood: "Optimistic" },
    { id: "2", title: "Weekend Plans", date: "2024-01-14", mood: "Excited" },
  ])

  // Quote from Real Inspire API: https://api.realinspire.live/v1/quotes/random
  type InspireQuote = { content: string; author: string }
  const [quote, setQuote] = useState<InspireQuote | null>(null)
  const quoteFade = useRef(new Animated.Value(1)).current
  const quoteTranslateY = quoteFade.interpolate({ inputRange: [0, 1], outputRange: [4, 0] })

  const fetchQuote = async () => {
    try {
      const res = await fetch('https://api.realinspire.live/v1/quotes/random?maxLength=160')
      const data = await res.json()
      if (Array.isArray(data) && data[0]) {
        setQuote({ content: data[0].content, author: data[0].author })
      }
    } catch (e) {
      // keep previous quote on error
    }
  }

  const refreshQuote = () => {
    Animated.timing(quoteFade, { toValue: 0, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(async () => {
      await fetchQuote()
      Animated.timing(quoteFade, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
    })
  }

  const shareQuote = async () => {
    try {
      const msg = quote ? `“${quote.content}” — ${quote.author}` : 'Sentisphere'
      await Share.share({ message: msg })
    } catch {}
  }

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    // load first quote
    fetchQuote()
    return () => clearInterval(t)
  }, [])

  const greeting = (() => {
    const hour = now.getHours()
    const text = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"
    return { text, icon: "user" as const, color: palette.tint }
  })()

  const getMoodColor = (mood: number) => {
    if (mood >= 8) return "#10B981" // Green
    if (mood >= 6) return "#F59E0B" // Yellow
    if (mood >= 4) return "#EF4444" // Red
    return "#6B7280" // Gray
  }

  const getMoodEmoji = (mood: number) => {
    if (mood >= 8) return "😊"
    if (mood >= 6) return "😐"
    if (mood >= 4) return "😔"
    return "😢"
  }

  // Inspiration subtle emphasis animations
  const inspirePulse = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(inspirePulse, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(inspirePulse, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    )
    pulse.start()
    return () => pulse.stop()
  }, [inspirePulse])

  const inspireGlowOpacity = inspirePulse.interpolate({ inputRange: [0, 1], outputRange: [0.06, 0.12] })
  const inspireScale = inspirePulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.01] })
  const inspireIconScale = inspirePulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] })

  // Entrance animations for major sections
  const entrance = useRef({
    greet: new Animated.Value(0),
    inspire: new Animated.Value(0),
    stat: new Animated.Value(0),
    quick: new Animated.Value(0),
    activity: new Animated.Value(0),
  }).current

  const runEntrance = () => {
    // reset
    entrance.greet.setValue(0)
    entrance.inspire.setValue(0)
    entrance.stat.setValue(0)
    entrance.quick.setValue(0)
    entrance.activity.setValue(0)
    // sequence
    const seq = [entrance.greet, entrance.inspire, entrance.stat, entrance.quick, entrance.activity].map((v, idx) =>
      Animated.timing(v, {
        toValue: 1,
        duration: 340,
        delay: idx * 60,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      })
    )
    Animated.stagger(90, seq).start()
  }

  useEffect(() => {
    runEntrance()
  }, [])

  useFocusEffect(
    // Re-run subtle entrance when navigating back to this screen
    useCallback(() => {
      runEntrance()
      return () => {}
    }, [])
  )

  const makeFadeUp = (v: Animated.Value) => ({
    opacity: v,
    transform: [
      {
        translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }),
      },
    ],
  })

  // Subtle interactive animation helpers for tiles
  const createTileAnim = () => {
    const scale = useRef(new Animated.Value(1)).current
    const to = (v: number, d: number = 120) =>
      Animated.timing(scale, {
        toValue: v,
        duration: d,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start()
    return {
      animStyle: { transform: [{ scale }] } as const,
      onHoverIn: () => to(1.02, 140),
      onHoverOut: () => to(1, 140),
      onPressIn: () => to(0.98, 90),
      onPressOut: () =>
        Animated.spring(scale, {
          toValue: 1.02,
          stiffness: 240,
          damping: 20,
          mass: 0.6,
          useNativeDriver: true,
        }).start(),
    }
  }

  const qa1 = createTileAnim()
  const qa2 = createTileAnim()
  const qa3 = createTileAnim()
  const qa4 = createTileAnim()

  // Animated scale for Recent Activity rows
  const activityScales = useRef(recentActivity.map(() => new Animated.Value(1))).current
  const actTo = (i: number, v: number, d = 120) =>
    Animated.timing(activityScales[i], {
      toValue: v,
      duration: d,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start()
  const onActHoverIn = (i: number) => actTo(i, 1.02, 140)
  const onActHoverOut = (i: number) => actTo(i, 1, 140)
  const onActPressIn = (i: number) => actTo(i, 0.99, 90)
  const onActPressOut = (i: number) => {
    Animated.spring(activityScales[i], {
      toValue: 1.01,
      stiffness: 240,
      damping: 20,
      mass: 0.6,
      useNativeDriver: true,
    }).start();
  }

  return (
    <ThemedView style={styles.container}>
      <LinearGradient colors={["#FFFFFF", "#FFFFFF"]} style={styles.pageBackground} pointerEvents="none" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scrollContent, { backgroundColor: '#FFFFFF' }]}>
        {/* Greeting Section (clean, prominent) */}
        <Animated.View style={[styles.greetingSection, makeFadeUp(entrance.greet)]}>
          <View style={styles.greetingRow}>
            <View style={styles.greetingText}>
              <ThemedText style={styles.greetingLine}>
                {greeting.text}
              </ThemedText>
              <ThemedText type="title" style={styles.greetingTitle}>
                Hyun
              </ThemedText>
              <ThemedText style={[styles.dateText, { color: palette.muted }]}>
                {now.toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </ThemedText>
            </View>
            <Pressable
              accessibilityLabel="Notifications"
              onPressIn={() => { if (Platform.OS !== 'web') { try { Haptics.selectionAsync() } catch {} } }}
              hitSlop={8}
              style={({ pressed }) => [styles.notifBtn, pressed && { opacity: 0.85 }]}
            >
              <Icon name="bell" size={20} color={palette.text} />
            </Pressable>
          </View>
        </Animated.View>
        <View style={styles.sectionSpacer} />

        {/* Enhanced Daily Inspiration with Gradient */}
        <Animated.View style={makeFadeUp(entrance.inspire)}>
          <Card style={[styles.inspirationCard, styles.cardShadow, styles.inspirationShadow]}>
            <LinearGradient colors={["#CFF2E2", "#0d8c4f"]} style={styles.inspirationGradient}>
              <CardContent style={styles.inspirationContent}>
                {/* Subtle animated glow overlay */}
                <Animated.View pointerEvents="none" style={[styles.inspirationGlow, { opacity: inspireGlowOpacity, transform: [{ scale: inspireScale }] }]}>
                  <LinearGradient colors={["rgba(255,255,255,0.25)", "rgba(255,255,255,0.05)"]} style={StyleSheet.absoluteFillObject as any} pointerEvents="none" />
                </Animated.View>
                {/* Inspiration actions */}
                <View style={styles.inspirationActions}>
                  <Pressable accessibilityLabel="Refresh quote" onPress={() => { if (Platform.OS !== 'web') { try { Haptics.selectionAsync() } catch {} } refreshQuote() }} style={({ pressed }) => [styles.inspirationActionBtn, pressed && { opacity: 0.85 }]} hitSlop={8}>
                    <Icon name="refresh-ccw" size={16} color="#6B7280" />
                  </Pressable>
                  <Pressable accessibilityLabel="Share quote" onPress={() => { if (Platform.OS !== 'web') { try { Haptics.selectionAsync() } catch {} } shareQuote() }} style={({ pressed }) => [styles.inspirationActionBtn, pressed && { opacity: 0.85 }]} hitSlop={8}>
                    <Icon name="share-2" size={16} color="#6B7280" />
                  </Pressable>
                </View>
                <Animated.View style={[styles.inspirationIcon, { transform: [{ scale: inspireIconScale }] }]}> 
                  <Icon name="sparkles" size={28} color={palette.tint} />
                </Animated.View>
                <Animated.View style={{ opacity: quoteFade, transform: [{ translateY: quoteTranslateY }] }}>
                  <ThemedText style={styles.inspirationQuote}>
                    “{quote?.content ?? 'Loading a little inspiration…'}”
                  </ThemedText>
                  <ThemedText style={styles.inspirationAuthor}>— {quote?.author ?? '—'}</ThemedText>
                </Animated.View>
              </CardContent>
            </LinearGradient>
          </Card>
        </Animated.View>

        {/* Weekly Summary Cards (optional) */}
        {showSummaryRow && (
          <View style={styles.summaryRow}>
            <Card style={[styles.summaryCard, { backgroundColor: "#ECFDF5" }]}>
              <CardContent style={styles.summaryContent}>
                <View style={[styles.summaryIcon, { backgroundColor: "#10B981" }]}>
                  <Icon name="activity" size={20} color="white" />
                </View>
                <ThemedText style={styles.summaryValue}>{weeklyMoodAverage}</ThemedText>
                <ThemedText style={styles.summaryLabel}>Avg Mood</ThemedText>
              </CardContent>
            </Card>

            <Card style={[styles.summaryCard, { backgroundColor: "#FEF3C7" }]}>
              <CardContent style={styles.summaryContent}>
                <View style={[styles.summaryIcon, { backgroundColor: "#F59E0B" }]}>
                  <Icon name="target" size={20} color="white" />
                </View>
                <ThemedText style={styles.summaryValue}>{currentStreak}</ThemedText>
                <ThemedText style={styles.summaryLabel}>Day Streak</ThemedText>
              </CardContent>
            </Card>

            <Card style={[styles.summaryCard, { backgroundColor: "#E0F2FE" }]}>
              <CardContent style={styles.summaryContent}>
                <View style={[styles.summaryIcon, { backgroundColor: "#0EA5E9" }]}>
                  <Icon name="book-open" size={20} color="white" />
                </View>
                <ThemedText style={styles.summaryValue}>{journalCount}</ThemedText>
                <ThemedText style={styles.summaryLabel}>Entries</ThemedText>
              </CardContent>
            </Card>
          </View>
        )}

        {/* Enhanced Quick Actions */}
        <Animated.View style={makeFadeUp(entrance.quick)}>
          <Card style={styles.cardShadow}>
          <CardContent style={styles.cardContent}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionTitleIcon}>
                <Icon name="sparkles" size={18} color="#6B7280" />
              </View>
              <ThemedText type="subtitle" style={styles.sectionTitle}>Quick Actions</ThemedText>
            </View>
            <View style={styles.quickGrid}>
              <Link href="/(student)/(tabs)/mood" asChild>
                <Pressable
                  onHoverIn={qa1.onHoverIn}
                  onHoverOut={qa1.onHoverOut}
                  onPressIn={() => { qa1.onPressIn(); if (Platform.OS !== 'web') { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {} } }}
                  onPressOut={qa1.onPressOut}
                  style={({ hovered, pressed }) =>
                    StyleSheet.flatten([
                      styles.qaTile,
                      styles.cardShadow,
                      hovered && styles.hoverLift,
                      pressed && styles.pressScale,
                      qaWidthStyle,
                    ])
                  }
                >
                  <Animated.View style={qa1.animStyle}>
                    <LinearGradient colors={["#8B5CF6", "#6D28D9"]} style={styles.tileGradient} pointerEvents="none" />
                    <View style={[styles.tileOrb, { top: -20, right: -14 }]} />
                    <View style={[styles.tileOrbSm, { bottom: -12, left: -10 }]} />
                    <View style={styles.qaTileInner}>
                      <View style={styles.qaTextBlock}>
                        <View style={styles.iconCircle}><Icon name="brain" size={20} color="#4C1D95" /></View>
                        <ThemedText style={styles.qaTitle}>Check Mood</ThemedText>
                        <ThemedText style={styles.qaSubtitle} numberOfLines={2} ellipsizeMode="tail">How are you feeling today?</ThemedText>
                      </View>
                    </View>
                  </Animated.View>
                </Pressable>
              </Link>

              <Link href="/(student)/(tabs)/journal" asChild>
                <Pressable
                  onHoverIn={qa2.onHoverIn}
                  onHoverOut={qa2.onHoverOut}
                  onPressIn={() => { qa2.onPressIn(); if (Platform.OS !== 'web') { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {} } }}
                  onPressOut={qa2.onPressOut}
                  style={({ hovered, pressed }) =>
                    StyleSheet.flatten([
                      styles.qaTile,
                      styles.cardShadow,
                      hovered && styles.hoverLift,
                      pressed && styles.pressScale,
                      qaWidthStyle,
                    ])
                  }
                >
                  <Animated.View style={qa2.animStyle}>
                    <LinearGradient colors={["#34D399", "#0d8c4f"]} style={styles.tileGradient} pointerEvents="none" />
                    <View style={[styles.tileOrb, { top: -20, right: -14 }]} />
                    <View style={[styles.tileOrbSm, { bottom: -12, left: -10 }]} />
                    <View style={styles.qaTileInner}>
                      <View style={styles.qaTextBlock}>
                        <View style={styles.iconCircle}><Icon name="book-open" size={20} color="#065F46" /></View>
                        <ThemedText style={styles.qaTitle}>Write Journal</ThemedText>
                        <ThemedText style={styles.qaSubtitle} numberOfLines={2} ellipsizeMode="tail">Reflect on your thoughts</ThemedText>
                      </View>
                    </View>
                  </Animated.View>
                </Pressable>
              </Link>

              <Link href="/(student)/appointments" asChild>
                <Pressable
                  onHoverIn={qa3.onHoverIn}
                  onHoverOut={qa3.onHoverOut}
                  onPressIn={() => { qa3.onPressIn(); if (Platform.OS !== 'web') { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {} } }}
                  onPressOut={qa3.onPressOut}
                  style={({ hovered, pressed }) =>
                    StyleSheet.flatten([
                      styles.qaTile,
                      styles.cardShadow,
                      hovered && styles.hoverLift,
                      pressed && styles.pressScale,
                      qaWidthStyle,
                    ])
                  }
                >
                  <Animated.View style={qa3.animStyle}>
                    <LinearGradient colors={["#60A5FA", "#2563EB"]} style={styles.tileGradient} pointerEvents="none" />
                    <View style={[styles.tileOrb, { top: -20, right: -14 }]} />
                    <View style={[styles.tileOrbSm, { bottom: -12, left: -10 }]} />
                    <View style={styles.qaTileInner}>
                      <View style={styles.qaTextBlock}>
                        <View style={styles.iconCircle}><Icon name="calendar" size={20} color="#1D4ED8" /></View>
                        <ThemedText style={styles.qaTitle}>Book Session</ThemedText>
                        <ThemedText style={styles.qaSubtitle} numberOfLines={2} ellipsizeMode="tail">Schedule with counselor</ThemedText>
                      </View>
                    </View>
                  </Animated.View>
                </Pressable>
              </Link>

              <Link href="/(student)/(tabs)/chat" asChild>
                <Pressable
                  onHoverIn={qa4.onHoverIn}
                  onHoverOut={qa4.onHoverOut}
                  onPressIn={() => { qa4.onPressIn(); if (Platform.OS !== 'web') { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {} } }}
                  onPressOut={qa4.onPressOut}
                  style={({ hovered, pressed }) =>
                    StyleSheet.flatten([
                      styles.qaTile,
                      styles.cardShadow,
                      hovered && styles.hoverLift,
                      pressed && styles.pressScale,
                      qaWidthStyle,
                    ])
                  }
                >
                  <Animated.View style={qa4.animStyle}>
                    <LinearGradient colors={["#5EEAD4", "#0D9488"]} style={styles.tileGradient} pointerEvents="none" />
                    <View style={[styles.tileOrb, { top: -20, right: -14 }]} />
                    <View style={[styles.tileOrbSm, { bottom: -12, left: -10 }]} />
                    <View style={styles.qaTileInner}>
                      <View style={styles.qaTextBlock}>
                        <View style={styles.iconCircle}><Icon name="message-square" size={20} color="#0F766E" /></View>
                        <ThemedText style={styles.qaTitle}>AI Chat</ThemedText>
                        <ThemedText style={styles.qaSubtitle} numberOfLines={2} ellipsizeMode="tail">Get instant support</ThemedText>
                      </View>
                    </View>
                  </Animated.View>
                </Pressable>
              </Link>
            </View>
          </CardContent>
          </Card>
        </Animated.View>

        {/* Recent Activity */}
        <Animated.View style={makeFadeUp(entrance.activity)}>
          <Card style={styles.cardShadow}>
          <CardContent style={styles.cardContent}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionTitleIcon}>
                <Icon name="activity" size={18} color="#6B7280" />
              </View>
              <ThemedText type="subtitle" style={styles.sectionTitle}>Recent Activity</ThemedText>
            </View>
            <View style={styles.activityList}>
              {recentActivity.map((item, i) => (
                <Link key={item.id} href={item.href as any} asChild>
                  <Pressable
                    onHoverIn={() => onActHoverIn(i)}
                    onHoverOut={() => onActHoverOut(i)}
                    onPressIn={() => { onActPressIn(i); if (Platform.OS !== 'web') { try { Haptics.selectionAsync() } catch {} } }}
                    onPressOut={() => onActPressOut(i)}
                    style={({ hovered, pressed }) =>
                      StyleSheet.flatten([
                        styles.activityItem,
                        hovered && styles.activityItemHover,
                        pressed && styles.activityItemPressed,
                      ])
                    }
                  >
                    <Animated.View style={{ transform: [{ scale: activityScales[i] }] }}>
                      <View style={[styles.activityIcon, { backgroundColor: item.bg }]}>
                        <Icon name={item.icon as any} size={18} color={item.color} />
                      </View>
                      <View style={styles.activityTextWrap}>
                        <ThemedText style={styles.activityTitle} numberOfLines={1}>
                          {item.title}
                        </ThemedText>
                        <ThemedText style={[styles.activityDesc, { color: palette.muted }]} numberOfLines={1}>
                          {item.description}
                        </ThemedText>
                        <View style={styles.activityMeta}>
                          <Icon name="clock" size={14} color={palette.muted} />
                          <ThemedText style={[styles.activityTime, { color: palette.muted }]}>
                            {formatTimeAgo(item.timestamp)}
                          </ThemedText>
                        </View>
                      </View>
                    </Animated.View>
                  </Pressable>
                </Link>
              ))}
            </View>
          </CardContent>
        </Card>
        </Animated.View>

        {/* Recent Mood Trends */}
        {showLegacySections && (
          <Card>
            <CardContent style={styles.cardContent}>
              <View style={styles.sectionHeader}>
                <ThemedText type="subtitle" style={styles.sectionTitle}>
                  Recent Moods
                </ThemedText>
                <Link href="/(student)/(tabs)/mood" asChild>
                  <Button variant="ghost" title="View All" />
                </Link>
              </View>
              <View style={styles.moodList}>
                {recentMoods.map((mood, index) => (
                  <View key={index} style={styles.moodItem}>
                    <View style={styles.moodLeft}>
                      <View style={[styles.moodIndicator, { backgroundColor: getMoodColor(mood.mood) }]}>
                        <ThemedText style={styles.moodEmoji}>{getMoodEmoji(mood.mood)}</ThemedText>
                      </View>
                      <View>
                        <ThemedText style={styles.moodValue}>{mood.mood}/10</ThemedText>
                        <ThemedText style={[styles.moodDate, { color: palette.muted }]}>
                          {new Date(mood.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </ThemedText>
                      </View>
                    </View>
                    {mood.note && (
                      <ThemedText style={[styles.moodNote, { color: palette.muted }]} numberOfLines={1}>
                        {mood.note}
                      </ThemedText>
                    )}
                  </View>
                ))}
              </View>
            </CardContent>
          </Card>
        )}

        {/* Recent Journal Entries */}
        {showLegacySections && (
          <Card>
            <CardContent style={styles.cardContent}>
              <View style={styles.sectionHeader}>
                <ThemedText type="subtitle" style={styles.sectionTitle}>
                  Recent Journals
                </ThemedText>
                <Link href="/(student)/(tabs)/journal" asChild>
                  <Button variant="ghost" title="View All" />
                </Link>
              </View>
              <View style={styles.journalList}>
                {recentJournals.map((journal) => (
                  <Link key={journal.id} href="/(student)/(tabs)/journal" asChild>
                    <Pressable style={styles.journalItem}>
                      <View style={styles.journalContent}>
                        <View style={styles.journalIcon}>
                          <Icon name="book-open" size={16} color="#16A34A" />
                        </View>
                        <View style={styles.journalText}>
                          <ThemedText style={styles.journalTitle} numberOfLines={1}>
                            {journal.title}
                          </ThemedText>
                          <View style={styles.journalMeta}>
                            <ThemedText style={[styles.journalDate, { color: palette.muted }]}>
                              {new Date(journal.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </ThemedText>
                            <View style={styles.journalMoodBadge}>
                              <ThemedText style={styles.journalMoodText}>{journal.mood}</ThemedText>
                            </View>
                          </View>
                        </View>
                      </View>
                    </Pressable>
                  </Link>
                ))}
              </View>
            </CardContent>
          </Card>
        )}

        {/* Upcoming Appointments */}
        <Card style={styles.cardShadow}>
          <CardContent style={styles.cardContent}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionTitleIcon}>
                <Icon name="calendar" size={18} color={palette.muted} />
              </View>
              <ThemedText type="subtitle" style={styles.sectionTitle}>Upcoming</ThemedText>
            </View>
            <View style={styles.appointmentEmpty}>
              <Icon name="calendar" size={32} color={palette.muted} />
              <ThemedText style={[styles.emptyText, { color: palette.muted }]}>No appointments scheduled</ThemedText>
              <Link href="/(student)/appointments" asChild>
                <Button title="Request Appointment" style={styles.appointmentButton} />
              </Link>
            </View>
          </CardContent>
        </Card>

        {/* Analytics Preview */}
        <Card style={styles.cardShadow}>
          <CardContent style={styles.cardContent}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <View style={styles.sectionTitleIcon}>
                  <Icon name="target" size={18} color={palette.muted} />
                </View>
                <ThemedText type="subtitle" style={styles.sectionTitle}>Your Insights</ThemedText>
              </View>
              <Link href="/(student)/analytics" asChild>
                <Pressable onPressIn={() => { if (Platform.OS !== 'web') { try { Haptics.selectionAsync() } catch {} } }}>
                  <Icon name="arrow-right" size={16} color={palette.muted} />
                </Pressable>
              </Link>
            </View>
            <ThemedText style={[styles.insightsText, { color: palette.muted }]}>
              View detailed mood trends, journaling patterns, and wellness insights.
            </ThemedText>
          </CardContent>
        </Card>
      </ScrollView>
    </ThemedView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  pageBackground: {
    position: "absolute",
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
  greetingSection: {
    marginBottom: 8,
  },
  sectionSpacer: {
    height: 12,
  },
  greetingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: 'space-between',
    gap: 12,
  },
  greetingIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  greetingText: {
    flex: 1,
  },
  greetingTitle: {
    fontSize: 36,
    fontFamily: "Inter_700Bold",
    marginTop: 2,
    marginBottom: 2,
    color: "#111827",
  },
  greetingLine: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: "#6B7280",
  },
  welcomeText: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 2,
  },
  notifBtn: {
    padding: 8,
    borderRadius: 12,
  },
  dateText: {
    fontSize: 14,
    lineHeight: 20,
  },
  inspirationCard: {
    overflow: "hidden",
  },
  inspirationGradient: {
    borderRadius: 12,
  },
  inspirationContent: {
    padding: 24,
    alignItems: "center",
  },
  inspirationActions: {
    position: "absolute",
    top: 12,
    right: 12,
    flexDirection: "row",
    gap: 8,
    zIndex: 10,
  },
  inspirationActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.8)",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  inspirationIcon: {
    marginBottom: 16,
  },
  inspirationGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
  },
  inspirationQuote: {
    fontSize: 18,
    // Ensure boldness on iOS with Inter family
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
    textAlign: "center",
    lineHeight: 26,
    marginBottom: 8,
  },
  inspirationAuthor: {
    fontSize: 14,
    color: "rgba(255,255,255,0.9)",
  },
  statCard: {
    width: "100%",
  },
  statContent: {
    padding: 20,
    alignItems: "center",
    gap: 6,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  statNumber: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: "#111827",
    lineHeight: 34,
  },
  statLabel: {
    fontSize: 12,
    color: "#6B7280",
  },
  summaryRow: {
    flexDirection: "row",
    gap: 12,
  },
  summaryCard: {
    flex: 1,
  },
  summaryContent: {
    padding: 16,
    alignItems: "center",
    gap: 8,
  },
  summaryIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1F2937",
  },
  summaryLabel: {
    fontSize: 12,
    color: "#6B7280",
    textAlign: "center",
  },
  cardContent: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    // Consistent bold weight
    fontFamily: "Inter_600SemiBold",
    marginBottom: 0,
    lineHeight: 22,
    color: "#111827",
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
    minHeight: 28,
  },
  sectionTitleIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  viewAllText: {
    fontSize: 14,
    color: "#6B7280",
  },
  cardShadow: {
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  inspirationShadow: {
    // Deeper, soft shadow for emphasis
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  hoverLift: {
    // Web hover: subtle lift
    transform: [{ translateY: -2 }],
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  pressScale: {
    opacity: 0.96,
  },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    justifyContent: "space-between",
  },
  qaTile: {
    width: Platform.select({ web: TILE_WIDTH as any, default: TILE_WIDTH_NATIVE as any }) as any,
    aspectRatio: 1,
    minHeight: 0,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 10,
    position: "relative",
    marginBottom: Platform.select({ web: 0, default: 16 }) as number,
    overflow: "hidden",
  },
  qaTileInner: {
    flex: 1,
    justifyContent: "flex-start",
    gap: 8,
    paddingHorizontal: 0,
    paddingVertical: 0,
    alignItems: 'flex-start',
    position: 'relative',
  },
  tileGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 20,
    opacity: Platform.select({ web: 1, default: 0.95 }) as number,
  },
  tileOrb: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  tileOrbSm: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  // Tile background color variants
  qaTilePurple: {
    backgroundColor: "#F5F3FF",
  },
  qaTileGreen: {
    backgroundColor: "#ECFDF5",
  },
  qaTileBlue: {
    backgroundColor: "#EFF6FF",
  },
  qaTileTeal: {
    backgroundColor: "#ECFEFF",
  },
  qaIconWrap: {
    width: Platform.select({ web: 36, default: 44 }) as number,
    height: Platform.select({ web: 36, default: 44 }) as number,
    borderRadius: Platform.select({ web: 18, default: 22 }) as number,
    alignItems: "center",
    justifyContent: "center",
  },
  qaHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Platform.select({ web: 10, default: 12 }) as number,
    paddingHorizontal: Platform.select({ web: 4, default: 6 }) as number,
    paddingTop: Platform.select({ web: 2, default: 4 }) as number,
  },
  qaArrowWrap: {
    width: Platform.select({ web: 30, default: 30 }) as number,
    height: Platform.select({ web: 30, default: 30 }) as number,
    borderRadius: Platform.select({ web: 14, default: 14 }) as number,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2F7",
  },
  qaTitle: {
    fontSize: Platform.select({ web: 16, default: 18 }) as number,
    // Ensure semi-bold weight across platforms
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
    // Slightly tighter spacing under title
    marginBottom: Platform.select({ web: 1, default: 2 }) as number,
  },
  qaSubtitle: {
    fontSize: Platform.select({ web: 12, default: 13 }) as number,
    // Tighter paragraph spacing on tiles
    lineHeight: Platform.select({ web: 16, default: 16 }) as number,
    marginTop: Platform.select({ web: 0, default: 1 }) as number,
    color: 'rgba(255,255,255,0.92)',
  },
  qaIconTop: {
    alignSelf: 'flex-start',
    marginBottom: Platform.select({ web: 6, default: 8 }) as number,
  },
  qaTitleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Platform.select({ web: 10, default: 12 }) as number,
    paddingVertical: Platform.select({ web: 6, default: 6 }) as number,
    borderRadius: 12,
  },
  qaTextBlock: {
    // Reduce gap between header row and text block
    marginTop: Platform.select({ web: 2, default: 4 }) as number,
    alignItems: 'flex-start',
    gap: 6,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  qaArrow: {
    position: 'absolute',
    top: Platform.select({ web: 10, default: 12 }) as number,
    right: Platform.select({ web: 10, default: 12 }) as number,
  },
  textHighlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 10,
    backgroundColor: "#111827",
    opacity: 0,
  },
  quickButton: {
    width: (width - 64) / 2,
    height: 80,
    borderRadius: 12,
    padding: 0,
  },
  quickButtonContent: {
    alignItems: "center",
    gap: 8,
  },
  quickButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  moodList: {
    gap: 12,
  },
  moodItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  moodLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  moodIndicator: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  moodEmoji: {
    fontSize: 18,
  },
  moodValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
  },
  moodDate: {
    fontSize: 12,
  },
  moodNote: {
    fontSize: 14,
    flex: 1,
    textAlign: "right",
    marginLeft: 16,
  },
  journalList: {
    gap: 8,
  },
  journalItem: {
    padding: 0,
    height: "auto",
    justifyContent: "flex-start",
  },
  journalContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    width: "100%",
  },
  journalIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F0FDF4",
    alignItems: "center",
    justifyContent: "center",
  },
  journalText: {
    flex: 1,
  },
  journalTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#1F2937",
    marginBottom: 2,
  },
  journalMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  journalDate: {
    fontSize: 12,
  },
  journalMoodBadge: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  journalMoodText: {
    fontSize: 10,
    color: "#6B7280",
    fontWeight: "500",
  },
  activityList: {
    gap: 12,
  },
  activityItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  activityItemHover: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
  },
  activityItemPressed: {
    backgroundColor: "#EEF2F7",
    borderRadius: 12,
  },
  activityIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  activityTextWrap: {
    flex: 1,
    position: "relative",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  textHighlightSmall: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 10,
    backgroundColor: "#111827",
    opacity: 0,
  },
  activityTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#111827",
  },
  activityDesc: {
    fontSize: 13,
    marginTop: 1,
  },
  activityMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  activityTime: {
    fontSize: 12,
  },
  appointmentEmpty: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 16,
  },
  appointmentButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  appointmentButtonText: {
    color: "white",
    fontWeight: "600",
  },
  insightsText: {
    fontSize: 14,
    lineHeight: 20,
  },
})
