"use client"

import { StyleSheet, View, ScrollView, Dimensions, Pressable, Animated, Easing, Platform, useWindowDimensions, Share, Linking, Image } from "react-native"
import { useEffect, useState, useRef, useCallback } from "react"
import { ThemedView } from "@/components/themed-view"
import { ThemedText } from "@/components/themed-text"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Link, router } from "expo-router"
import { useColorScheme } from "@/hooks/use-color-scheme"
import { Colors } from "@/constants/theme"
import { Icon } from "@/components/ui/icon"
import { LinearGradient } from "expo-linear-gradient"

import * as Haptics from "expo-haptics"
import * as SecureStore from "expo-secure-store"
import { useFocusEffect } from '@react-navigation/native'

const { width } = Dimensions.get("window")

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

type UpcomingAppointment = {
  id: string
  counselor: string
  startAt: string
  mode?: string
  location?: string
}

export default function EnhancedDashboardScreen() {
  const scheme = useColorScheme() ?? "light"
  const palette = Colors[scheme] as any
  const [now, setNow] = useState(new Date())
  const [journalCount] = useState(12)
  const [weeklyMoodAverage] = useState(7.2)
  const [currentStreak] = useState(5)
  const { width: screenWidth } = useWindowDimensions()
  const API = process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:8010'
  const [displayName, setDisplayName] = useState<string>("")
  const getAuthToken = useCallback(async (): Promise<string | null> => {
    if (Platform.OS === 'web') {
      try { return (window as any)?.localStorage?.getItem('auth_token') || null } catch { return null }
    }
    try { return await SecureStore.getItemAsync('auth_token') } catch { return null }
  }, [])

  // Logout confirmation overlay
  // Legacy overlay removed in favor of dedicated /logout page
  const decodeJwtName = useCallback((t: string): string | null => {
    try {
      const p = t.split('.')[1]
      if (!p) return null
      const s = p.replace(/-/g, '+').replace(/_/g, '/')
      const pad = s.length % 4 ? s + '='.repeat(4 - (s.length % 4)) : s
      const json = typeof atob === 'function' ? atob(pad) : ''
      if (!json) return null
      const obj = JSON.parse(json)
      return obj?.nickname || obj?.name || null
    } catch { return null }
  }, [])
  const fetchCurrentUser = useCallback(async () => {
    try {
      const tok = await getAuthToken()
      if (!tok) return
      const localName = Platform.OS === 'web' ? decodeJwtName(tok) : null
      if (localName) setDisplayName((prev) => prev || localName)
      const res = await fetch(`${API}/api/auth/mobile/me`, { headers: { Authorization: `Bearer ${tok}` } })
      if (!res.ok) return
      const d = await res.json()
      setDisplayName(d?.nickname || d?.name || localName || "Student")
    } catch {}
  }, [API, getAuthToken, decodeJwtName])
  useEffect(() => { fetchCurrentUser() }, [fetchCurrentUser])

  const logout = useCallback(async () => {
    try {
      if (Platform.OS === 'web') {
        try { (window as any)?.localStorage?.removeItem('auth_token') } catch {}
      } else {
        try { await SecureStore.deleteItemAsync('auth_token') } catch {}
      }
    } finally {
      router.replace('/auth')
    }
  }, [])

  useEffect(() => {
    fetch(`${API}/health`)
      .then((r) => r.json())
      .then((d) => console.log('health:', d))
      .catch((e) => console.error('health error:', e))
  }, [])
  // Responsive quick action tile sizing
  const CARD_PADDING = 20 * 2; // CardContent padding on both sides
  const SCROLL_PADDING = 16 * 2; // scrollContent padding on both sides
  const TILE_GAP = 12;
  const availableWidth = screenWidth - SCROLL_PADDING - CARD_PADDING;
  const tileWidth = Math.floor((availableWidth - TILE_GAP) / 2);
  const quickActionTileSize = {
    width: tileWidth,
    minHeight: Math.max(120, Math.round(tileWidth * 0.65)),
  }

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

  const [upcomingAppointments] = useState<UpcomingAppointment[]>([])
  const nextAppointment = upcomingAppointments[0] ?? null
  const hasUpcomingAppointments = !!nextAppointment

  const formatAppointmentDate = (startAt: string) => {
    const date = new Date(startAt)
    if (Number.isNaN(date.getTime())) return startAt
    return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
  }

  const formatAppointmentTime = (startAt: string) => {
    const date = new Date(startAt)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }

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

  const COUNSELOR_ADDRESS = 'CSM Building · Ground Floor · Room No. 104'
  const COUNSELOR_MAP_URL = 'https://maps.app.goo.gl/wg2zkJAagttgkLLb6'
  const openDirections = () => {
    const q = encodeURIComponent(COUNSELOR_ADDRESS)
    const url = Platform.select({
      ios: COUNSELOR_MAP_URL,
      android: COUNSELOR_MAP_URL,
      default: COUNSELOR_MAP_URL,
    }) as string
    Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${q}`))
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
    mood: new Animated.Value(0),
    inspire: new Animated.Value(0),
    stat: new Animated.Value(0),
    quick: new Animated.Value(0),
    activity: new Animated.Value(0),
  }).current

  const runEntrance = () => {
    // reset
    entrance.greet.setValue(0)
    entrance.mood.setValue(0)
    entrance.inspire.setValue(0)
    entrance.stat.setValue(0)
    entrance.quick.setValue(0)
    entrance.activity.setValue(0)
    // sequence
    const seq = [entrance.greet, entrance.inspire, entrance.quick, entrance.stat, entrance.mood, entrance.activity].map((v, idx) =>
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
                {displayName || "Student"}
              </ThemedText>
              <ThemedText style={[styles.dateText, { color: palette.muted }]}>
                {now.toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </ThemedText>
            </View>
            <View style={styles.headerActions}>
              <Pressable
                accessibilityLabel="Notifications"
                onPressIn={() => { if (Platform.OS !== 'web') { try { Haptics.selectionAsync() } catch {} } }}
                hitSlop={8}
                style={({ pressed }) => [styles.notifBtn, pressed && { opacity: 0.85 }]}
              >
                <Icon name="bell" size={20} color={palette.text} />
              </Pressable>
              <Pressable
                accessibilityLabel="Log out"
                onPressIn={() => { if (Platform.OS !== 'web') { try { Haptics.selectionAsync() } catch {} } }}
                onPress={() => router.push('/logout')}
                hitSlop={8}
                style={({ pressed }) => [styles.notifBtn, pressed && { opacity: 0.85 }]}
              >
                <Icon name="log-out" size={20} color={palette.text} />
              </Pressable>
            </View>
          </View>
        </Animated.View>
        <View style={styles.sectionSpacer} />

        {/* Enhanced Daily Inspiration with Gradient */}
        <Animated.View style={makeFadeUp(entrance.inspire)}>
          <Card style={[styles.inspirationCard, styles.cardShadow, styles.inspirationShadow]}>
            <LinearGradient colors={["#065F46", palette.tint]} style={styles.inspirationGradient}>
              <CardContent style={styles.inspirationContent}>
                {/* Subtle animated glow overlay */}
                <Animated.View pointerEvents="none" style={[styles.inspirationGlow, { opacity: inspireGlowOpacity, transform: [{ scale: inspireScale }] }]}>
                  <LinearGradient colors={["rgba(255,255,255,0.25)", "rgba(255,255,255,0.05)"]} style={StyleSheet.absoluteFillObject as any} pointerEvents="none" />
                </Animated.View>
                {/* Inspiration actions */}
                <View style={styles.inspirationHeader}>
                  <ThemedText style={styles.inspirationTitle}>Quotes for the day</ThemedText>
                  <View style={styles.inspirationActions}>
                    <Pressable accessibilityLabel="Refresh quote" onPress={() => { if (Platform.OS !== 'web') { try { Haptics.selectionAsync() } catch {} } refreshQuote() }} style={({ pressed }) => [styles.inspirationActionBtn, pressed && { opacity: 0.7 }]} hitSlop={8}>
                      <Icon name="refresh-ccw" size={18} color="rgba(255,255,255,0.95)" />
                    </Pressable>
                    <Pressable accessibilityLabel="Share quote" onPress={() => { if (Platform.OS !== 'web') { try { Haptics.selectionAsync() } catch {} } shareQuote() }} style={({ pressed }) => [styles.inspirationActionBtn, pressed && { opacity: 0.7 }]} hitSlop={8}>
                      <Icon name="share-2" size={18} color="rgba(255,255,255,0.95)" />
                    </Pressable>
                  </View>
                </View>
                <Animated.View style={{ width: "100%", opacity: quoteFade, transform: [{ translateY: quoteTranslateY }] }}>
                  <ThemedText style={styles.inspirationQuote}>
                    “{quote?.content ?? 'Loading a little inspiration…'}”
                  </ThemedText>
                  <ThemedText style={styles.inspirationAuthor}>— {quote?.author ?? '—'}</ThemedText>
                </Animated.View>
              </CardContent>
            </LinearGradient>
          </Card>
        </Animated.View>


        {/* Enhanced Quick Actions */}
        <Animated.View style={makeFadeUp(entrance.quick)}>
          <Card style={styles.cardShadow}>
          <CardContent style={styles.quickActionsContent}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionTitleIcon}>
                <Icon name="sparkles" size={18} color="#6B7280" />
              </View>
              <ThemedText type="subtitle" style={styles.sectionTitle}>Quick Actions</ThemedText>
            </View>
            <View style={styles.quickActionsGrid}>
              <Link href="/(student)/(tabs)/mood" asChild>
                <Pressable
                  onHoverIn={qa1.onHoverIn}
                  onHoverOut={qa1.onHoverOut}
                  onPressIn={() => { qa1.onPressIn(); if (Platform.OS !== 'web') { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch {} } }}
                  onPressOut={qa1.onPressOut}
                  style={({ hovered, pressed }) =>
                    StyleSheet.flatten([
                      styles.quickActionTile,
                      { borderColor: '#E9D5FF' },
                      hovered && styles.hoverLift,
                      pressed && styles.pressScale,
                      quickActionTileSize,
                    ])
                  }
                >
                  <Animated.View style={[{ flex: 1 }, qa1.animStyle]}>
                    <View style={styles.quickActionContent} pointerEvents="none">
                      <View style={styles.quickActionHeader}>
                        <View style={[styles.quickActionIconWrap, { backgroundColor: '#F3E8FF' }]}>
                          <Icon name="brain" size={18} color="#7C3AED" />
                        </View>
                        <Icon name="chevron-right" size={16} color="#9CA3AF" />
                      </View>
                      <View style={styles.quickActionText}>
                        <ThemedText style={styles.quickActionTitle}>Check Mood</ThemedText>
                        <ThemedText style={styles.quickActionSubtitle}>Quick daily check-in</ThemedText>
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
                      styles.quickActionTile,
                      { borderColor: '#A7F3D0' },
                      hovered && styles.hoverLift,
                      pressed && styles.pressScale,
                      quickActionTileSize,
                    ])
                  }
                >
                  <Animated.View style={[{ flex: 1 }, qa2.animStyle]}>
                    <View style={styles.quickActionContent} pointerEvents="none">
                      <View style={styles.quickActionHeader}>
                        <View style={[styles.quickActionIconWrap, { backgroundColor: '#ECFDF5' }]}>
                          <Icon name="book-open" size={18} color="#0D8C4F" />
                        </View>
                        <Icon name="chevron-right" size={16} color="#9CA3AF" />
                      </View>
                      <View style={styles.quickActionText}>
                        <ThemedText style={styles.quickActionTitle}>Write Journal</ThemedText>
                        <ThemedText style={styles.quickActionSubtitle}>Reflect in minutes</ThemedText>
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
                      styles.quickActionTile,
                      { borderColor: '#BFDBFE' },
                      hovered && styles.hoverLift,
                      pressed && styles.pressScale,
                      quickActionTileSize,
                    ])
                  }
                >
                  <Animated.View style={[{ flex: 1 }, qa3.animStyle]}>
                    <View style={styles.quickActionContent} pointerEvents="none">
                      <View style={styles.quickActionHeader}>
                        <View style={[styles.quickActionIconWrap, { backgroundColor: '#EFF6FF' }]}>
                          <Icon name="calendar" size={18} color="#2563EB" />
                        </View>
                        <Icon name="chevron-right" size={16} color="#9CA3AF" />
                      </View>
                      <View style={styles.quickActionText}>
                        <ThemedText style={styles.quickActionTitle}>Book Session</ThemedText>
                        <ThemedText style={styles.quickActionSubtitle}>Schedule counseling</ThemedText>
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
                      styles.quickActionTile,
                      { borderColor: '#A7F3D0' },
                      hovered && styles.hoverLift,
                      pressed && styles.pressScale,
                      quickActionTileSize,
                    ])
                  }
                >
                  <Animated.View style={[{ flex: 1 }, qa4.animStyle]}>
                    <View style={styles.quickActionContent} pointerEvents="none">
                      <View style={styles.quickActionHeader}>
                        <View style={[styles.quickActionIconWrap, { backgroundColor: '#F0FDF4' }]}>
                          <Icon name="message-square" size={18} color="#059669" />
                        </View>
                        <Icon name="chevron-right" size={16} color="#9CA3AF" />
                      </View>
                      <View style={styles.quickActionText}>
                        <ThemedText style={styles.quickActionTitle}>Chat</ThemedText>
                        <ThemedText style={styles.quickActionSubtitle}>Get instant support</ThemedText>
                      </View>
                    </View>
                  </Animated.View>
                </Pressable>
              </Link>
            </View>
          </CardContent>
          </Card>
        </Animated.View>

        {/* Upcoming Appointments */}
        {hasUpcomingAppointments && nextAppointment && (
          <Animated.View style={makeFadeUp(entrance.stat)}>
            <Card style={styles.cardShadow}>
              <CardContent style={styles.upcomingContent}>
                <View style={styles.sectionTitleRow}>
                  <View style={styles.sectionTitleIcon}>
                    <Icon name="calendar" size={18} color={palette.muted} />
                  </View>
                  <ThemedText type="subtitle" style={styles.sectionTitle}>Upcoming session</ThemedText>
                </View>

                <View style={styles.upcomingSummary}>
                  <View style={styles.upcomingMain}>
                    <ThemedText style={styles.upcomingCounselor}>{nextAppointment.counselor}</ThemedText>
                    <ThemedText style={[styles.upcomingMeta, { color: palette.muted }]}>
                      {formatAppointmentDate(nextAppointment.startAt)} · {formatAppointmentTime(nextAppointment.startAt)}
                    </ThemedText>
                  </View>
                  <View style={styles.upcomingTags}>
                    {nextAppointment.mode ? (
                      <View style={styles.upcomingBadge}>
                        <ThemedText style={styles.upcomingBadgeText}>{nextAppointment.mode}</ThemedText>
                      </View>
                    ) : null}
                    {nextAppointment.location ? (
                      <View style={styles.upcomingBadge}>
                        <ThemedText style={styles.upcomingBadgeText}>{nextAppointment.location}</ThemedText>
                      </View>
                    ) : null}
                  </View>
                </View>

                <View style={styles.upcomingActions}>
                  <Link href="/(student)/appointments" asChild>
                    <Button variant="outline" title="Manage appointments" />
                  </Link>
                </View>
              </CardContent>
            </Card>
          </Animated.View>
        )}

        <Animated.View style={makeFadeUp(entrance.mood)}>
          <Card style={styles.cardShadow}>
            <LinearGradient colors={["#065F46", palette.tint]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.moodGradient}>
              <CardContent style={styles.moodContent}>
                <View style={styles.moodHeader}>
                  <ThemedText style={styles.moodTitle}>State of mood</ThemedText>
                  <View style={styles.moodAvatar}><Icon name="user" size={16} color="rgba(255,255,255,0.95)" /></View>
                </View>
                <ThemedText style={styles.moodPrompt}>How are you feeling now?</ThemedText>
                <Link href="/(student)/(tabs)/mood" asChild>
                  <Pressable onPressIn={() => { if (Platform.OS !== 'web') { try { Haptics.selectionAsync() } catch {} } }} style={styles.moodButton}>
                    <ThemedText style={styles.moodButtonText}>Log Mood</ThemedText>
                  </Pressable>
                </Link>
              </CardContent>
            </LinearGradient>
          </Card>
        </Animated.View>

        {/* Counselor Location (matches Mood Prompt layout) */}
        <Animated.View style={makeFadeUp(entrance.activity)}>
          <Card style={[styles.cardShadow, styles.locationCard]}>
            <LinearGradient colors={["#065F46", palette.tint]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.moodGradient}>
              <CardContent style={[styles.moodContent, styles.locationCenter]}>
                <View style={{ alignItems: 'center', gap: 1 }}>
                  <View style={{ marginBottom: 7 }}>
                    <Icon name="map-pin" size={24} color="#FFFFFF" />
                  </View>
                  <ThemedText style={styles.locationPrompt}>Guidance Office</ThemedText>
                  <ThemedText style={styles.locationSubtitle}>CSM Building · Ground Floor · Room No. 104</ThemedText>
                </View>
                <Pressable
                  accessibilityLabel="Directions"
                  onPressIn={() => { if (Platform.OS !== 'web') { try { Haptics.selectionAsync() } catch {} } }}
                  onPress={openDirections}
                  style={({ pressed }) => [styles.locationPill, pressed && { opacity: 0.95 }]}
                >
                  <View style={styles.locationPillIcon}><Icon name="arrow-right" size={14} color="#FFFFFF" /></View>
                  <ThemedText style={styles.locationDirectionsText}>Directions</ThemedText>
                </Pressable>
              </CardContent>
            </LinearGradient>
          </Card>
        </Animated.View>

        {/* Recent Activity (commented out) */}
        {/**
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

              </ScrollView>
      {/* Logout overlay removed; handled by /logout route */}
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  greetingTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    marginTop: 2,
    marginBottom: 2,
    color: "#111827",
  },
  greetingLine: {
    fontSize: 14,
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
  logoutOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 9999,
  },
  logoutBottom: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
  },
  dateText: {
    fontSize: 12,
    lineHeight: 20,
  },
  inspirationCard: {
    overflow: "hidden",
  },
  inspirationGradient: {
    borderRadius: 24,
  },
  inspirationContent: {
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: "flex-start",
    minHeight: 180,
  },
  inspirationHeader: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 0,
  },
  inspirationTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "rgba(255,255,255,0.95)",
  },
  inspirationActions: {
    flexDirection: "row",
    gap: 2,
  },
  inspirationActionBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  inspirationIcon: {
    marginBottom: 16,
  },
  inspirationGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 24,
  },
  inspirationQuote: {
    fontSize: 20,
    // Ensure boldness on iOS with Inter family
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
    textAlign: "left",
    lineHeight: 28,
    marginBottom: 8,
    alignSelf: "stretch",
  },
  inspirationAuthor: {
    fontSize: 14,
    color: "rgba(255,255,255,0.9)",
    alignSelf: "stretch",
  },
  // Mood prompt card styles
  moodGradient: {
    borderRadius: 24,
  },
  moodContent: {
    padding: 24,
    gap: 14,
  },
  moodHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  moodTitle: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: 'rgba(255,255,255,0.92)',
  },
  moodAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moodPrompt: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    lineHeight: 30,
    marginBottom: 12,
  },
  moodButton: {
    width: '100%',
    alignSelf: 'stretch',
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  moodButtonText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: 'rgba(255,255,255,0.95)',
  },
  // Location card styles
  locationCard: {
    overflow: 'hidden',
  },
  locationContent: {
    padding: 0,
  },
  locationHero: {
    height: 200,
    borderRadius: 24,
    overflow: 'hidden',
  },
  locationOverlayRow: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  locationLabel: {
    fontSize: 28,
    lineHeight: 34,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
  },
  locationSublabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
  },
  locationDirectionsBtn: {
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(17,24,39,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)'
  },
  locationDirectionsText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  locationCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    minHeight: 160,
  },
  locationPrompt: {
    fontSize: 24,
    lineHeight: 30,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  locationSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.92)',
    textAlign: 'center',
    marginTop: 0,
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.38)'
  },
  locationPillIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.24)'
  },
  locationMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  locationMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  locationMetaText: {
    fontSize: 11,
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
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  statNumber: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: "#111827",
    lineHeight: 30,
  },
  statLabel: {
    fontSize: 10,
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
  upcomingContent: {
    padding: 20,
    gap: 14,
  },
  upcomingSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  upcomingMain: {
    flex: 1,
    gap: 4,
  },
  upcomingCounselor: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: '#111827',
  },
  upcomingMeta: {
    fontSize: 12,
  },
  upcomingTags: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  upcomingBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#F0FDF4',
  },
  upcomingBadgeText: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    color: '#047857',
  },
  upcomingActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  summaryIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1F2937",
  },
  summaryLabel: {
    fontSize: 10,
    color: "#6B7280",
    textAlign: "center",
  },
  cardContent: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 14,
    // Consistent bold weight
    fontFamily: "Inter_600SemiBold",
    marginBottom: 0,
    lineHeight: 20,
    color: "#111827",
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    minHeight: 28,
  },
  sectionTitleIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
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
    fontSize: 12,
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
  quickActionsContent: {
    padding: 20,
    gap: 16,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  quickActionTile: {
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    flexShrink: 0,
    flexGrow: 0,
    marginBottom: 0,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  quickActionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionContent: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  quickActionHeader: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  quickActionText: {
    alignItems: 'flex-start',
    gap: 3,
    flex: 1,
  },
  quickActionTitle: {
    color: '#111827',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
  },
  quickActionSubtitle: {
    color: '#9CA3AF',
    fontSize: 11,
  },
  qaTileLeft: { marginRight: 16 },
  tileOrb: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  tileOrbSm: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  qaTileInner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
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
    width: Platform.select({ web: 32, default: 40 }) as number,
    height: Platform.select({ web: 32, default: 40 }) as number,
    borderRadius: Platform.select({ web: 16, default: 20 }) as number,
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
    width: Platform.select({ web: 26, default: 26 }) as number,
    height: Platform.select({ web: 26, default: 26 }) as number,
    borderRadius: Platform.select({ web: 12, default: 12 }) as number,
    alignItems: "center",
    justifyContent: "center",
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
    gap: 2,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  iconCircleLg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
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
    height: 72,
    borderRadius: 12,
    padding: 0,
  },
  quickButtonContent: {
    alignItems: "center",
    gap: 8,
  },
  quickButtonText: {
    fontSize: 12,
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
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  moodEmoji: {
    fontSize: 16,
  },
  moodValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1F2937",
  },
  moodDate: {
    fontSize: 10,
  },
  moodNote: {
    fontSize: 12,
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
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F0FDF4",
    alignItems: "center",
    justifyContent: "center",
  },
  journalText: {
    flex: 1,
  },
  journalTitle: {
    fontSize: 14,
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
    fontSize: 10,
  },
  journalMoodBadge: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  journalMoodText: {
    fontSize: 9,
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
    width: 32,
    height: 32,
    borderRadius: 16,
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
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#111827",
  },
  activityDesc: {
    fontSize: 11,
    marginTop: 1,
  },
  activityMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  activityTime: {
    fontSize: 10,
  },
  appointmentEmpty: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 20,
  },
  emptyText: {
    fontSize: 14,
  },
  appointmentButton: {
    width: '100%',
    maxWidth: 320,
    alignSelf: 'center',
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
