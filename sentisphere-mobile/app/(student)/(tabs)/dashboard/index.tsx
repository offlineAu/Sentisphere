"use client"

import { StyleSheet, View, ScrollView, Dimensions, Pressable, Animated, Easing, Platform, useWindowDimensions } from "react-native"
import { useEffect, useState, useRef } from "react"
import { ThemedView } from "@/components/themed-view"
import { ThemedText } from "@/components/themed-text"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Link } from "expo-router"
import { useColorScheme } from "@/hooks/use-color-scheme"
import { Colors } from "@/constants/theme"
import { Icon } from "@/components/ui/icon"
import { LinearGradient } from "expo-linear-gradient"

const { width } = Dimensions.get("window")
const GRID_PADDING = 16 // matches scrollContent padding
const CARD_CONTENT_PADDING = 20 // matches styles.cardContent padding
const QUICK_GAP = 20 // matches styles.quickGrid.gap
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

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const greeting = (() => {
    const hour = now.getHours()
    if (hour < 12) return { text: "Good morning", icon: "sun" as const, color: "#F59E0B" }
    if (hour < 17) return { text: "Good afternoon", icon: "sun" as const, color: "#EF4444" }
    return { text: "Good evening", icon: "moon" as const, color: "#8B5CF6" }
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
      <LinearGradient colors={["#F8FAFC", "#EEF2FF"]} style={styles.pageBackground} pointerEvents="none" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Enhanced Greeting Section */}
        <View style={styles.greetingSection}>
          <View style={styles.greetingRow}>
            <View style={[styles.greetingIcon, { backgroundColor: `${greeting.color}20` }]}>
              <Icon name={greeting.icon} size={24} color={greeting.color} />
            </View>
            <View style={styles.greetingText}>
              <ThemedText type="title" style={styles.greetingTitle}>
                {greeting.text}, Jamie!
              </ThemedText>
              <ThemedText style={styles.welcomeText}>Welcome to Sentisphere</ThemedText>
              <ThemedText style={[styles.dateText, { color: palette.muted }]}>
                {now.toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </ThemedText>
            </View>
          </View>
        </View>

        {/* Enhanced Daily Inspiration with Gradient */}
        <Card style={[styles.inspirationCard, styles.cardShadow]}>
          <LinearGradient colors={["#F3E8FF", "#E9D5FF"]} style={styles.inspirationGradient}>
            <CardContent style={styles.inspirationContent}>
              <View style={styles.inspirationIcon}>
                <Icon name="sparkles" size={28} color="#A855F7" />
              </View>
              <ThemedText style={styles.inspirationQuote}>
                "Every small step forward is progress worth celebrating."
              </ThemedText>
              <ThemedText style={styles.inspirationAuthor}>— Daily Inspiration</ThemedText>
            </CardContent>
          </LinearGradient>
        </Card>

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

        {/* Journal Entries Stat */}
        <Card style={[styles.statCard, styles.cardShadow]}>
          <CardContent style={styles.statContent}>
            <View style={[styles.statIcon, { backgroundColor: "#ECFDF5" }]}>
              <Icon name="book-open" size={20} color="#16A34A" />
            </View>
            <ThemedText style={styles.statNumber}>{journalCount}</ThemedText>
            <ThemedText style={styles.statLabel}>Journal Entries</ThemedText>
          </CardContent>
        </Card>

        {/* Enhanced Quick Actions */}
        <Card style={styles.cardShadow}>
          <CardContent style={styles.cardContent}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Quick Actions
            </ThemedText>
            <View style={styles.quickGrid}>
              <Link href="/(student)/(tabs)/mood" asChild>
                <Pressable
                  onHoverIn={qa1.onHoverIn}
                  onHoverOut={qa1.onHoverOut}
                  onPressIn={qa1.onPressIn}
                  onPressOut={qa1.onPressOut}
                  style={({ hovered, pressed }) =>
                    StyleSheet.flatten([
                      styles.qaTile,
                      styles.qaTilePurple,
                      styles.cardShadow,
                      hovered && { backgroundColor: "#EDE9FE" },
                      pressed && { backgroundColor: "#E9D5FF" },
                      hovered && styles.hoverLift,
                      pressed && styles.pressScale,
                      qaWidthStyle,
                    ])
                  }
                >
                  <Animated.View style={qa1.animStyle}>
                    <LinearGradient
                      colors={["#F7F2FF", "#F1EAFE"]}
                      style={styles.tileGradient}
                      pointerEvents="none"
                    />
                    <View style={styles.qaTileInner}>
                      <View style={styles.qaHeaderRow}>
                        <View style={[styles.qaIconWrap, { backgroundColor: "#EDE9FE" }]}> 
                          <Icon name="brain" size={20} color="#8B5CF6" />
                        </View>
                        <Icon name="arrow-right" size={18} color="#7C3AED" />
                      </View>
                      <View style={styles.qaTextBlock}>
                        <ThemedText style={[styles.qaTitle, { color: "#7C3AED" }]}>Check Mood</ThemedText>
                        <ThemedText style={[styles.qaSubtitle, { color: palette.muted }]} numberOfLines={2} ellipsizeMode="tail">How are you feeling today?</ThemedText>
                      </View>
                    </View>
                  </Animated.View>
                </Pressable>
              </Link>

              <Link href="/(student)/(tabs)/journal/new" asChild>
                <Pressable
                  onHoverIn={qa2.onHoverIn}
                  onHoverOut={qa2.onHoverOut}
                  onPressIn={qa2.onPressIn}
                  onPressOut={qa2.onPressOut}
                  style={({ hovered, pressed }) =>
                    StyleSheet.flatten([
                      styles.qaTile,
                      styles.qaTileGreen,
                      styles.cardShadow,
                      hovered && { backgroundColor: "#DCFCE7" },
                      pressed && { backgroundColor: "#D1FAE5" },
                      hovered && styles.hoverLift,
                      pressed && styles.pressScale,
                      qaWidthStyle,
                    ])
                  }
                >
                  <Animated.View style={qa2.animStyle}>
                    <LinearGradient
                      colors={["#F2FFF7", "#ECFDF5"]}
                      style={styles.tileGradient}
                      pointerEvents="none"
                    />
                    <View style={styles.qaTileInner}>
                      <View style={styles.qaHeaderRow}>
                        <View style={[styles.qaIconWrap, { backgroundColor: "#DCFCE7" }]}> 
                          <Icon name="book-open" size={20} color="#16A34A" />
                        </View>
                        <Icon name="arrow-right" size={18} color="#16A34A" />
                      </View>
                      <View style={styles.qaTextBlock}>
                        <ThemedText style={[styles.qaTitle, { color: "#16A34A" }]}>Write Journal</ThemedText>
                        <ThemedText style={[styles.qaSubtitle, { color: palette.muted }]} numberOfLines={2} ellipsizeMode="tail">Reflect on your thoughts</ThemedText>
                      </View>
                    </View>
                  </Animated.View>
                </Pressable>
              </Link>

              <Link href="/(student)/appointments" asChild>
                <Pressable
                  onHoverIn={qa3.onHoverIn}
                  onHoverOut={qa3.onHoverOut}
                  onPressIn={qa3.onPressIn}
                  onPressOut={qa3.onPressOut}
                  style={({ hovered, pressed }) =>
                    StyleSheet.flatten([
                      styles.qaTile,
                      styles.qaTileBlue,
                      styles.cardShadow,
                      hovered && { backgroundColor: "#DBEAFE" },
                      pressed && { backgroundColor: "#BFDBFE" },
                      hovered && styles.hoverLift,
                      pressed && styles.pressScale,
                      qaWidthStyle,
                    ])
                  }
                >
                  <Animated.View style={qa3.animStyle}>
                    <LinearGradient
                      colors={["#F5F9FF", "#EFF6FF"]}
                      style={styles.tileGradient}
                      pointerEvents="none"
                    />
                    <View style={styles.qaTileInner}>
                      <View style={styles.qaHeaderRow}>
                        <View style={[styles.qaIconWrap, { backgroundColor: "#DBEAFE" }]}> 
                          <Icon name="calendar" size={20} color="#3B82F6" />
                        </View>
                        <Icon name="arrow-right" size={18} color="#2563EB" />
                      </View>
                      <View style={styles.qaTextBlock}>
                        <ThemedText style={[styles.qaTitle, { color: "#2563EB" }]}>Book Session</ThemedText>
                        <ThemedText style={[styles.qaSubtitle, { color: palette.muted }]} numberOfLines={2} ellipsizeMode="tail">Schedule with counselor</ThemedText>
                      </View>
                    </View>
                  </Animated.View>
                </Pressable>
              </Link>

              <Link href="/(student)/(tabs)/chat" asChild>
                <Pressable
                  onHoverIn={qa4.onHoverIn}
                  onHoverOut={qa4.onHoverOut}
                  onPressIn={qa4.onPressIn}
                  onPressOut={qa4.onPressOut}
                  style={({ hovered, pressed }) =>
                    StyleSheet.flatten([
                      styles.qaTile,
                      styles.qaTileTeal,
                      styles.cardShadow,
                      hovered && { backgroundColor: "#CFFAFE" },
                      pressed && { backgroundColor: "#A5F3FC" },
                      hovered && styles.hoverLift,
                      pressed && styles.pressScale,
                      qaWidthStyle,
                    ])
                  }
                >
                  <Animated.View style={qa4.animStyle}>
                    <LinearGradient
                      colors={["#F1FEFF", "#ECFEFF"]}
                      style={styles.tileGradient}
                      pointerEvents="none"
                    />
                    <View style={styles.qaTileInner}>
                      <View style={styles.qaHeaderRow}>
                        <View style={[styles.qaIconWrap, { backgroundColor: "#CFFAFE" }]}> 
                          <Icon name="message-square" size={20} color="#0D9488" />
                        </View>
                        <Icon name="arrow-right" size={18} color="#0D9488" />
                      </View>
                      <View style={styles.qaTextBlock}>
                        <ThemedText style={[styles.qaTitle, { color: "#0D9488" }]}>AI Chat</ThemedText>
                        <ThemedText style={[styles.qaSubtitle, { color: palette.muted }]} numberOfLines={2} ellipsizeMode="tail">Get instant support</ThemedText>
                      </View>
                    </View>
                  </Animated.View>
                </Pressable>
              </Link>
            </View>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card style={styles.cardShadow}>
          <CardContent style={styles.cardContent}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Recent Activity
            </ThemedText>
            <View style={styles.activityList}>
              {recentActivity.map((item, i) => (
                <Link key={item.id} href={item.href as any} asChild>
                  <Pressable
                    onHoverIn={() => onActHoverIn(i)}
                    onHoverOut={() => onActHoverOut(i)}
                    onPressIn={() => onActPressIn(i)}
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
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Upcoming
            </ThemedText>
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
              <ThemedText type="subtitle" style={styles.sectionTitle}>
                Your Insights
              </ThemedText>
              <Link href="/(student)/analytics" asChild>
                <Pressable>
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
    marginBottom: 16,
  },
  greetingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  greetingIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  greetingText: {
    flex: 1,
  },
  greetingTitle: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 8,
    color: "#111827",
  },
  welcomeText: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 4,
  },
  dateText: {
    fontSize: 16,
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
  inspirationIcon: {
    marginBottom: 16,
  },
  inspirationQuote: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1F2937",
    textAlign: "center",
    lineHeight: 26,
    marginBottom: 8,
  },
  inspirationAuthor: {
    fontSize: 14,
    color: "#6B7280",
  },
  statCard: {
    alignSelf: "center",
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
    fontWeight: "700",
    color: "#111827",
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
    fontWeight: "600",
    marginBottom: 16,
    color: "#111827",
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
    gap: 20,
    justifyContent: "space-between",
  },
  qaTile: {
    width: Platform.select({ web: TILE_WIDTH as any, default: TILE_WIDTH_NATIVE as any }) as any,
    minHeight: Platform.select({ web: 160, default: 200 }) as number,
    borderRadius: 18,
    paddingHorizontal: Platform.select({ web: 24, default: 24 }) as number,
    paddingVertical: Platform.select({ web: 24, default: 28 }) as number,
    gap: Platform.select({ web: 14, default: 18 }) as number,
    position: "relative",
    marginBottom: Platform.select({ web: 0, default: 20 }) as number,
    overflow: "hidden",
  },
  qaTileInner: {
    flex: 1,
    justifyContent: "space-between",
    gap: Platform.select({ web: 10, default: 12 }) as number,
  },
  tileGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 18,
    opacity: Platform.select({ web: 0.9, default: 0.8 }) as number,
  },
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
  qaHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Platform.select({ web: 12, default: 18 }) as number,
  },
  qaIconWrap: {
    width: Platform.select({ web: 32, default: 40 }) as number,
    height: Platform.select({ web: 32, default: 40 }) as number,
    borderRadius: Platform.select({ web: 16, default: 20 }) as number,
    alignItems: "center",
    justifyContent: "center",
  },
  qaArrowWrap: {
    width: Platform.select({ web: 28, default: 28 }) as number,
    height: Platform.select({ web: 28, default: 28 }) as number,
    borderRadius: Platform.select({ web: 14, default: 14 }) as number,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2F7",
  },
  qaTitle: {
    fontSize: Platform.select({ web: 16, default: 18 }) as number,
    fontWeight: "600",
    color: "#111827",
    marginBottom: Platform.select({ web: 4, default: 12 }) as number,
  },
  qaSubtitle: {
    fontSize: Platform.select({ web: 12, default: 13 }) as number,
    marginTop: Platform.select({ web: 2, default: 8 }) as number,
  },
  qaTextBlock: {
    marginTop: Platform.select({ web: 2, default: 12 }) as number,
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
    fontWeight: "600",
    color: "#1F2937",
    marginBottom: 4,
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
    paddingVertical: 6,
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
    fontWeight: "600",
    color: "#111827",
  },
  activityDesc: {
    fontSize: 13,
    marginTop: 2,
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
    backgroundColor: "#3B82F6",
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
