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
import { GlobalScreenWrapper } from "@/components/GlobalScreenWrapper"

import * as Haptics from "expo-haptics"
import * as SecureStore from "expo-secure-store"
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { notificationStore } from '@/stores/notificationStore'

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
  const API = process.env.EXPO_PUBLIC_API_URL || 'https://sentisphere-production.up.railway.app'
  const [displayName, setDisplayName] = useState<string>("")
  const [backendConnected, setBackendConnected] = useState<boolean | null>(null)
  const [unreadCount, setUnreadCount] = useState<number>(0)
  const [currentEventIndex, setCurrentEventIndex] = useState<number>(0)
  const lastEventIndexRef = useRef<number>(0)
  const navigation = useNavigation()
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
    } catch { }
  }, [API, getAuthToken, decodeJwtName])
  useEffect(() => { fetchCurrentUser() }, [fetchCurrentUser])

  // Subscribe to notification store for instant updates when notifications are read
  useEffect(() => {
    const unsubscribe = notificationStore.subscribe(() => {
      // Update unread count from store (instant update when marking as read)
      setUnreadCount(notificationStore.getUnreadCount())
    })
    return unsubscribe
  }, [])

  // Fetch full notifications list and update store - this ensures badge is always accurate
  const fetchNotifications = useCallback(async () => {
    try {
      const tok = await getAuthToken()
      if (!tok) return
      const res = await fetch(`${API}/api/notifications?limit=100`, {
        headers: { Authorization: `Bearer ${tok}` }
      })
      if (res.ok) {
        const data = await res.json()
        notificationStore.setNotifications(data.notifications || [])
        // Store subscription will automatically update unreadCount
      }
    } catch (e) {
      console.log('[Dashboard] Failed to fetch notifications:', e)
    }
  }, [API, getAuthToken])

  // Fetch notifications on mount
  useEffect(() => { fetchNotifications() }, [fetchNotifications])

  // Fetch notifications when screen is focused (to catch new notifications)
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      fetchNotifications()
    })
    return unsub
  }, [navigation, fetchNotifications])

  // Health check to verify backend connection on app startup
  useEffect(() => {
    const checkBackendHealth = async () => {
      try {
        const res = await fetch(`${API}/health`, { method: 'GET' })
        if (res.ok) {
          const data = await res.json()
          console.log('[Backend] Connected:', data)
          setBackendConnected(true)
        } else {
          console.warn('[Backend] Health check failed:', res.status)
          setBackendConnected(false)
        }
      } catch (err) {
        console.error('[Backend] Connection error:', err)
        setBackendConnected(false)
      }
    }
    checkBackendHealth()
  }, [API])

  const logout = useCallback(async () => {
    try {
      if (Platform.OS === 'web') {
        try { (window as any)?.localStorage?.removeItem('auth_token') } catch { }
      } else {
        try { await SecureStore.deleteItemAsync('auth_token') } catch { }
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
    } catch { }
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
      return () => { }
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

  // Quick Action tile animations (only 2 tiles now)
  const qa1 = createTileAnim()
  const qa2 = createTileAnim()

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
    <GlobalScreenWrapper backgroundColor="#FFFFFF">
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
                accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
                onPressIn={() => { if (Platform.OS !== 'web') { try { Haptics.selectionAsync() } catch { } } }}
                onPress={() => router.push('/(student)/notifications')}
                hitSlop={8}
                style={({ pressed }) => [styles.notifBtn, pressed && { opacity: 0.85 }]}
              >
                <Icon name="bell" size={20} color={palette.text} />
                {unreadCount > 0 && <View style={styles.unreadDot} />}
              </Pressable>
              <Pressable
                accessibilityLabel="Log out"
                onPressIn={() => { if (Platform.OS !== 'web') { try { Haptics.selectionAsync() } catch { } } }}
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
                    <Pressable accessibilityLabel="Refresh quote" onPress={() => { if (Platform.OS !== 'web') { try { Haptics.selectionAsync() } catch { } } refreshQuote() }} style={({ pressed }) => [styles.inspirationActionBtn, pressed && { opacity: 0.7 }]} hitSlop={8}>
                      <Icon name="refresh-ccw" size={18} color="rgba(255,255,255,0.95)" />
                    </Pressable>
                    <Pressable accessibilityLabel="Share quote" onPress={() => { if (Platform.OS !== 'web') { try { Haptics.selectionAsync() } catch { } } shareQuote() }} style={({ pressed }) => [styles.inspirationActionBtn, pressed && { opacity: 0.7 }]} hitSlop={8}>
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


        {/* Action Card Buttons - Floating Cards Side by Side */}
        <Animated.View style={[styles.actionCardsRow, makeFadeUp(entrance.quick)]}>
          {/* Book Appointment Card */}
          <Link href="/(student)/appointments" asChild style={styles.actionCardLink}>
            <Pressable
              onHoverIn={qa1.onHoverIn}
              onHoverOut={qa1.onHoverOut}
              onPressIn={() => { qa1.onPressIn(); if (Platform.OS !== 'web') { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch { } } }}
              onPressOut={qa1.onPressOut}
              style={({ hovered, pressed }) =>
                StyleSheet.flatten([
                  styles.actionCardButton,
                  hovered && styles.hoverLift,
                  pressed && styles.actionCardPressed,
                ])
              }
            >
              <Animated.View style={[styles.actionCardInner, qa1.animStyle]}>
                <View style={styles.actionCardIconWrapBlue}>
                  <Icon name="calendar" size={26} color="#2563EB" />
                </View>
                <View style={styles.actionCardTextWrap}>
                  <ThemedText style={styles.actionCardTitle}>Book Appointment</ThemedText>
                  <ThemedText style={styles.actionCardSubtitle}>Request counseling</ThemedText>
                </View>
              </Animated.View>
            </Pressable>
          </Link>

          {/* Chat Support Card */}
          <Link href="/(student)/(tabs)/chat" asChild style={styles.actionCardLink}>
            <Pressable
              onHoverIn={qa2.onHoverIn}
              onHoverOut={qa2.onHoverOut}
              onPressIn={() => { qa2.onPressIn(); if (Platform.OS !== 'web') { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch { } } }}
              onPressOut={qa2.onPressOut}
              style={({ hovered, pressed }) =>
                StyleSheet.flatten([
                  styles.actionCardButton,
                  hovered && styles.hoverLift,
                  pressed && styles.actionCardPressed,
                ])
              }
            >
              <Animated.View style={[styles.actionCardInner, qa2.animStyle]}>
                <View style={styles.actionCardIconWrapGreen}>
                  <Icon name="message-square" size={26} color="#059669" />
                </View>
                <View style={styles.actionCardTextWrap}>
                  <ThemedText style={styles.actionCardTitle}>Chat Support</ThemedText>
                  <ThemedText style={styles.actionCardSubtitle}>Get instant help</ThemedText>
                </View>
              </Animated.View>
            </Pressable>
          </Link>
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
        {/* Counselor Location - Now first */}
        <Animated.View style={makeFadeUp(entrance.mood)}>
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
                  onPressIn={() => { if (Platform.OS !== 'web') { try { Haptics.selectionAsync() } catch { } } }}
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

        {/* Events Carousel - Swipeable */}
        <Animated.View style={makeFadeUp(entrance.activity)}>
          <View style={styles.eventsSectionHeader}>
            <ThemedText style={styles.eventsSectionTitle}>Upcoming Events</ThemedText>
            <View style={styles.eventsDotsContainer}>
              {[0, 1, 2].map((index) => (
                <View
                  key={index}
                  style={[
                    styles.eventsDot,
                    currentEventIndex === index && styles.eventsDotActive,
                  ]}
                />
              ))}
            </View>
          </View>
          {/* Responsive card width: full width on phones, max 500px on tablets */}
          {(() => {
            const cardWidth = Math.min(screenWidth - 32, 500)
            const cardHeight = screenWidth > 600 ? 350 : 320 // Increased for Android button visibility
            return (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                decelerationRate="fast"
                snapToInterval={cardWidth + 12}
                snapToAlignment="start"
                style={Platform.OS !== 'web' ? { overflow: 'visible' } : undefined}
                contentContainerStyle={styles.eventsCarouselContent}
                onScroll={(event) => {
                  const offsetX = event.nativeEvent.contentOffset.x
                  const newIndex = Math.round(offsetX / (cardWidth + 12))
                  const clampedIndex = Math.max(0, Math.min(2, newIndex))
                  if (clampedIndex !== lastEventIndexRef.current) {
                    lastEventIndexRef.current = clampedIndex
                    setCurrentEventIndex(clampedIndex)
                    if (Platform.OS !== 'web') {
                      try { Haptics.selectionAsync() } catch { }
                    }
                  }
                }}
                scrollEventThrottle={16}
              >
                {/* Event 1 - Wellness Workshop */}
                <View style={[styles.eventCardWrapper, { width: cardWidth }]}>
                  <Card style={styles.eventCardModern}>
                    <LinearGradient
                      colors={['#065F46', '#0d8c4f', '#10B981']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.eventGradientBg}
                    >
                      {/* Decorative circles */}
                      <View style={[styles.eventDecorCircle, styles.eventDecorCircle1]} />
                      <View style={[styles.eventDecorCircle, styles.eventDecorCircle2]} />

                      <View style={styles.eventModernContent}>
                        {/* Top Row: Date Badge + Category */}
                        <View style={styles.eventTopRow}>
                          <View style={styles.eventCategoryPill}>
                            <Icon name="heart" size={12} color="#FFFFFF" />
                            <ThemedText style={styles.eventCategoryText}>Wellness</ThemedText>
                          </View>
                          <View style={styles.eventDateBadgeModern}>
                            <ThemedText style={styles.eventDateDayModern}>
                              {new Date().getDate().toString().padStart(2, '0')}
                            </ThemedText>
                            <ThemedText style={styles.eventDateMonthModern}>
                              {new Date().toLocaleString('en-US', { month: 'short' }).toUpperCase()}
                            </ThemedText>
                          </View>
                        </View>

                        {/* Title & Description */}
                        <ThemedText style={styles.eventTitleModern}>Wellness Workshop</ThemedText>
                        <ThemedText style={styles.eventDescModern} numberOfLines={2}>
                          Join us for mindfulness and self-care with the counseling team
                        </ThemedText>

                        {/* Info Pills Row */}
                        <View style={styles.eventInfoPillsRow}>
                          <View style={styles.eventInfoPill}>
                            <Icon name="map-pin" size={12} color="rgba(255,255,255,0.9)" />
                            <ThemedText style={styles.eventInfoPillText}>Room 104</ThemedText>
                          </View>
                          <View style={styles.eventInfoPill}>
                            <Icon name="clock" size={12} color="rgba(255,255,255,0.9)" />
                            <ThemedText style={styles.eventInfoPillText}>2:00 PM</ThemedText>
                          </View>
                          <View style={styles.eventInfoPill}>
                            <Icon name="users" size={12} color="rgba(255,255,255,0.9)" />
                            <ThemedText style={styles.eventInfoPillText}>45</ThemedText>
                          </View>
                        </View>

                        {/* CTA Button */}
                        <Pressable
                          onPressIn={() => { if (Platform.OS !== 'web') { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch { } } }}
                          onPress={() => router.push('/(student)/events/wellness')}
                          style={({ pressed }) => [styles.eventJoinBtnModern, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
                        >
                          <ThemedText style={styles.eventJoinBtnTextModern}>Join Event</ThemedText>
                          <Icon name="arrow-right" size={16} color="#0d8c4f" />
                        </Pressable>
                      </View>
                    </LinearGradient>
                  </Card>
                </View>

                {/* Event 2 - Stress Relief Session */}
                <View style={[styles.eventCardWrapper, { width: cardWidth }]}>
                  <Card style={styles.eventCardModern}>
                    <LinearGradient
                      colors={['#7C3AED', '#8B5CF6', '#A78BFA']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.eventGradientBg}
                    >
                      <View style={[styles.eventDecorCircle, styles.eventDecorCircle1]} />
                      <View style={[styles.eventDecorCircle, styles.eventDecorCircle2]} />

                      <View style={styles.eventModernContent}>
                        <View style={styles.eventTopRow}>
                          <View style={styles.eventCategoryPill}>
                            <Icon name="sparkles" size={12} color="#FFFFFF" />
                            <ThemedText style={styles.eventCategoryText}>Relaxation</ThemedText>
                          </View>
                          <View style={styles.eventDateBadgeModern}>
                            <ThemedText style={styles.eventDateDayModern}>15</ThemedText>
                            <ThemedText style={styles.eventDateMonthModern}>DEC</ThemedText>
                          </View>
                        </View>

                        <ThemedText style={styles.eventTitleModern}>Stress Relief Session</ThemedText>
                        <ThemedText style={styles.eventDescModern} numberOfLines={2}>
                          Learn breathing techniques and stress management strategies
                        </ThemedText>

                        <View style={styles.eventInfoPillsRow}>
                          <View style={styles.eventInfoPill}>
                            <Icon name="map-pin" size={12} color="rgba(255,255,255,0.9)" />
                            <ThemedText style={styles.eventInfoPillText}>Auditorium</ThemedText>
                          </View>
                          <View style={styles.eventInfoPill}>
                            <Icon name="clock" size={12} color="rgba(255,255,255,0.9)" />
                            <ThemedText style={styles.eventInfoPillText}>10:00 AM</ThemedText>
                          </View>
                          <View style={styles.eventInfoPill}>
                            <Icon name="users" size={12} color="rgba(255,255,255,0.9)" />
                            <ThemedText style={styles.eventInfoPillText}>78</ThemedText>
                          </View>
                        </View>

                        <Pressable
                          onPressIn={() => { if (Platform.OS !== 'web') { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch { } } }}
                          onPress={() => router.push('/(student)/events/stress')}
                          style={({ pressed }) => [styles.eventJoinBtnModern, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
                        >
                          <ThemedText style={[styles.eventJoinBtnTextModern, { color: '#7C3AED' }]}>Join Event</ThemedText>
                          <Icon name="arrow-right" size={16} color="#7C3AED" />
                        </Pressable>
                      </View>
                    </LinearGradient>
                  </Card>
                </View>

                {/* Event 3 - Group Counseling */}
                <View style={[styles.eventCardWrapper, { width: cardWidth }]}>
                  <Card style={styles.eventCardModern}>
                    <LinearGradient
                      colors={['#0369A1', '#0EA5E9', '#38BDF8']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.eventGradientBg}
                    >
                      <View style={[styles.eventDecorCircle, styles.eventDecorCircle1]} />
                      <View style={[styles.eventDecorCircle, styles.eventDecorCircle2]} />

                      <View style={styles.eventModernContent}>
                        <View style={styles.eventTopRow}>
                          <View style={styles.eventCategoryPill}>
                            <Icon name="message-circle" size={12} color="#FFFFFF" />
                            <ThemedText style={styles.eventCategoryText}>Support</ThemedText>
                          </View>
                          <View style={styles.eventDateBadgeModern}>
                            <ThemedText style={styles.eventDateDayModern}>20</ThemedText>
                            <ThemedText style={styles.eventDateMonthModern}>DEC</ThemedText>
                          </View>
                        </View>

                        <ThemedText style={styles.eventTitleModern}>Group Counseling</ThemedText>
                        <ThemedText style={styles.eventDescModern} numberOfLines={2}>
                          Safe space to share experiences and support each other
                        </ThemedText>

                        <View style={styles.eventInfoPillsRow}>
                          <View style={styles.eventInfoPill}>
                            <Icon name="map-pin" size={12} color="rgba(255,255,255,0.9)" />
                            <ThemedText style={styles.eventInfoPillText}>Room 104</ThemedText>
                          </View>
                          <View style={styles.eventInfoPill}>
                            <Icon name="clock" size={12} color="rgba(255,255,255,0.9)" />
                            <ThemedText style={styles.eventInfoPillText}>3:00 PM</ThemedText>
                          </View>
                          <View style={styles.eventInfoPill}>
                            <Icon name="users" size={12} color="rgba(255,255,255,0.9)" />
                            <ThemedText style={styles.eventInfoPillText}>12</ThemedText>
                          </View>
                        </View>

                        <Pressable
                          onPressIn={() => { if (Platform.OS !== 'web') { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch { } } }}
                          onPress={() => router.push('/(student)/events/counseling')}
                          style={({ pressed }) => [styles.eventJoinBtnModern, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
                        >
                          <ThemedText style={[styles.eventJoinBtnTextModern, { color: '#0369A1' }]}>Join Event</ThemedText>
                          <Icon name="arrow-right" size={16} color="#0369A1" />
                        </Pressable>
                      </View>
                    </LinearGradient>
                  </Card>
                </View>
              </ScrollView>
            )
          })()}
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
    </GlobalScreenWrapper>
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
    gap: 20,
    paddingBottom: 120, // Account for floating nav bar
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
    position: 'relative' as const,
  },
  unreadDot: {
    position: 'absolute' as const,
    top: 6,
    right: 6,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22C55E', // Sentisphere green
    borderWidth: 2,
    borderColor: '#FFFFFF',
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
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
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
  // Floating Action Card Buttons - Side by Side Row
  actionCardsRow: {
    flexDirection: 'row',
    gap: 14,
  },
  actionCardLink: {
    flex: 1,
  },
  actionCardButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    // Strong visible shadow for iOS
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  actionCardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  actionCardInner: {
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  actionCardIconWrapBlue: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
  },
  actionCardIconWrapGreen: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
  },
  actionCardTextWrap: {
    alignItems: 'center',
    gap: 3,
  },
  actionCardTitle: {
    color: '#111827',
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    textAlign: 'center',
  },
  actionCardSubtitle: {
    color: '#9CA3AF',
    fontSize: 11,
    textAlign: 'center',
  },
  // Legacy styles kept for potential reuse
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
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
  // Event Card Styles
  eventCard: {
    overflow: 'hidden',
    borderRadius: 20,
  },
  eventImageContainer: {
    position: 'relative',
    width: '100%',
    height: 140,
  },
  eventImage: {
    width: '100%',
    height: '100%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  eventDateBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    borderRadius: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  eventDateGradient: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventDateDay: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    lineHeight: 24,
  },
  eventDateMonth: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 0.5,
  },
  eventContent: {
    padding: 16,
    gap: 8,
  },
  eventTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#111827',
    marginBottom: 2,
  },
  eventDescription: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 8,
  },
  eventInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eventInfoText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: '#0d8c4f',
  },
  eventDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 12,
  },
  eventActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eventPrice: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: '#111827',
  },
  eventJoinButton: {
    backgroundColor: '#0d8c4f',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
    shadowColor: '#0d8c4f',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  eventJoinButtonText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: '#FFFFFF',
  },
  eventFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  eventJoinedPill: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  eventJoinedText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: '#0d8c4f',
  },
  eventOrganizer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eventOrganizerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventOrganizerName: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: '#111827',
  },
  eventOrganizerRole: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: '#6B7280',
  },
  // Modern Event Carousel Styles
  eventsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  eventsSectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#111827',
  },
  eventsDotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  eventsDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E5E7EB',
  },
  eventsDotActive: {
    backgroundColor: '#0d8c4f',
    width: 20,
  },
  eventsCarouselContent: {
    paddingRight: 16,
    paddingTop: 8,     // Space for shadow
    paddingBottom: 16, // Space for shadow
    gap: 12,
  },
  eventCardWrapper: {
    width: width - 32,
    backgroundColor: 'transparent', // Required for Android shadow
    // Match cardShadow style used by other cards
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  eventCardModern: {
    borderRadius: 24,
    overflow: 'hidden', // For gradient corner clipping only
    backgroundColor: 'transparent', // Prevent white border on web
  },
  eventGradientBg: {
    borderRadius: 24,
    height: 320, // Increased for Android button visibility
    position: 'relative',
    overflow: 'hidden',
  },
  eventDecorCircle: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  eventDecorCircle1: {
    width: 150,
    height: 150,
    top: -40,
    right: -40,
  },
  eventDecorCircle2: {
    width: 100,
    height: 100,
    bottom: -30,
    left: -30,
  },
  eventModernContent: {
    padding: 18,
    paddingBottom: 20, // Increased for Android button visibility
    gap: 10,
    flex: 1,
    justifyContent: 'space-between',
  },
  eventTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  eventCategoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  eventCategoryText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: '#FFFFFF',
  },
  eventDateBadgeModern: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
  },
  eventDateDayModern: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    lineHeight: 22,
  },
  eventDateMonthModern: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 0.5,
  },
  eventTitleModern: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#FFFFFF',
    marginTop: 2,
  },
  eventDescModern: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 20,
  },
  eventInfoPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  eventInfoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  eventInfoPillText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: 'rgba(255,255,255,0.95)',
  },
  eventJoinBtnModern: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 8,
  },
  eventJoinBtnTextModern: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: '#0d8c4f',
  },
})
