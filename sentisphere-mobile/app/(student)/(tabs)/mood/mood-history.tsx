import { StyleSheet, View, ScrollView, Pressable, Animated, Easing, Platform, RefreshControl, Text } from 'react-native';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ThemedText } from '@/components/themed-text';
import { GlobalScreenWrapper } from '@/components/GlobalScreenWrapper';
import { Icon } from '@/components/ui/icon';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import * as SecureStore from 'expo-secure-store';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import dayjs from 'dayjs';

type CheckinEntry = {
    checkin_id: number;
    user_id: number;
    mood_level: string;
    energy_level: string;
    stress_level: string;
    comment?: string;
    created_at: string;
};

// Mood emoji mapping - using standard Unicode emojis for cross-platform support
// These render consistently as they are standard Unicode characters
const MOOD_EMOJI: Record<string, string> = {
    'Awesome': '😊',
    'Great': '😄',
    'Loved': '🥰',
    'Okay': '🙂',
    'Meh': '😐',
    'Anxious': '😰',
    'Bad': '😢',
    'Terrible': '😫',
    'Upset': '😠',
    'Neutral': '😐',
    'Fine': '🙂',
    'Not Great': '😕',
    'Rough': '😞',
};

// Soft pastel background colors for Week view cards (Sentisphere brand-aligned)
const MOOD_CARD_BG: Record<string, string> = {
    'Awesome': '#FEF3C7',     // Warm amber
    'Great': '#D1FAE5',       // Soft mint
    'Loved': '#FCE7F3',       // Soft pink
    'Okay': '#E0F2FE',        // Light sky
    'Meh': '#F3F4F6',         // Light gray
    'Anxious': '#EDE9FE',     // Soft lavender
    'Bad': '#DBEAFE',         // Light blue
    'Terrible': '#FEE2E2',    // Soft red
    'Upset': '#FECACA',       // Light coral
    'Neutral': '#F9FAFB',     // Off white
    'Fine': '#FCE7F3',        // Soft pink
    'Not Great': '#DBEAFE',   // Light blue
    'Rough': '#EDE9FE',       // Soft lavender
};

// Calendar circle colors - vibrant but soft (matches reference design)
const MOOD_CIRCLE_COLOR: Record<string, string> = {
    'Awesome': '#FBBF24',     // Amber
    'Great': '#34D399',       // Emerald
    'Loved': '#F472B6',       // Pink
    'Okay': '#60A5FA',        // Blue
    'Meh': '#9CA3AF',         // Gray
    'Anxious': '#A78BFA',     // Purple
    'Bad': '#60A5FA',         // Blue
    'Terrible': '#F87171',    // Red
    'Upset': '#FB7185',       // Rose
    'Neutral': '#94A3B8',     // Slate
    'Fine': '#F472B6',        // Pink
    'Not Great': '#60A5FA',   // Blue
    'Rough': '#A78BFA',       // Purple
};

// Generate mood tags from entry data
const getMoodTags = (entry: CheckinEntry): string[] => {
    const tags: string[] = [];
    if (entry.energy_level) {
        const energy = entry.energy_level.toLowerCase();
        if (energy !== 'moderate') tags.push(energy);
    }
    if (entry.stress_level) {
        const stress = entry.stress_level.toLowerCase().replace(' stress', '').replace('no ', '');
        if (stress && stress !== 'moderate') tags.push(stress);
    }
    return tags.slice(0, 4);
};

const BRAND_GREEN = '#0D8C4F';

export default function MoodHistoryScreen() {
    const [entries, setEntries] = useState<CheckinEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [tab, setTab] = useState<0 | 1>(0);
    const [segW, setSegW] = useState(0);
    const [monthOffset, setMonthOffset] = useState(0);
    const scheme = useColorScheme() ?? 'light';
    const palette = Colors[scheme] as any;
    const insets = useSafeAreaInsets();
    const API = process.env.EXPO_PUBLIC_API_URL || 'https://sentisphere-production.up.railway.app';

    // Animations
    const animTab = useRef(new Animated.Value(0)).current;
    const entrance = useRef({
        header: new Animated.Value(0),
        content: new Animated.Value(0),
    }).current;
    const contentFade = useRef(new Animated.Value(1)).current;

    const doHaptic = async (type: 'light' | 'selection' = 'selection') => {
        if (Platform.OS === 'web') return;
        try {
            if (type === 'selection') await Haptics.selectionAsync();
            else await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } catch { }
    };

    const runEntrance = useCallback(() => {
        entrance.header.setValue(0);
        entrance.content.setValue(0);
        Animated.stagger(100, [
            Animated.timing(entrance.header, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            Animated.timing(entrance.content, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]).start();
    }, []);

    const fadeUp = (v: Animated.Value) => ({
        opacity: v,
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
    });

    const switchTab = (newTab: 0 | 1) => {
        if (newTab === tab) return;
        doHaptic('selection');
        Animated.timing(animTab, { toValue: newTab, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
        setTab(newTab);
        contentFade.setValue(0);
        Animated.timing(contentFade, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    };

    const indicatorStyle = useMemo(() => {
        const pad = 4;
        const itemW = (segW - pad * 2) / 2;
        const tx = animTab.interpolate({ inputRange: [0, 1], outputRange: [0, itemW] });
        return { width: itemW, transform: [{ translateX: tx }], opacity: segW > 0 ? 1 : 0 };
    }, [segW, animTab]);

    const getAuthToken = async (): Promise<string | null> => {
        if (Platform.OS === 'web') {
            try { return (window as any)?.localStorage?.getItem('auth_token') || null } catch { return null }
        }
        try { return await SecureStore.getItemAsync('auth_token') } catch { return null }
    };

    const fetchEntries = useCallback(async (isRefresh = false) => {
        try {
            if (isRefresh) setRefreshing(true);
            else setLoading(true);
            setError(null);
            const token = await getAuthToken();
            if (!token) { setError('Not signed in'); return; }
            const res = await fetch(`${API}/api/emotional-checkins`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error(`Failed: ${res.status}`);
            const data = await res.json();
            setEntries(Array.isArray(data) ? data : []);
        } catch (e: any) {
            setError(e?.message || 'Failed to load');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [API]);

    useEffect(() => { fetchEntries(); }, [fetchEntries]);
    useFocusEffect(useCallback(() => { runEntrance(); fetchEntries(); return () => { }; }, [runEntrance, fetchEntries]));

    // Group entries by date
    const grouped = useMemo(() => {
        const map = new Map<string, CheckinEntry[]>();
        entries.forEach(e => {
            const key = dayjs(e.created_at).format('YYYY-MM-DD');
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(e);
        });
        return map;
    }, [entries]);

    // Last 7 days
    const week = useMemo(() => {
        const arr: string[] = [];
        for (let i = 0; i < 7; i++) arr.push(dayjs().subtract(i, 'day').format('YYYY-MM-DD'));
        return arr;
    }, []);

    // Current month calendar
    const month = useMemo(() => dayjs().add(monthOffset, 'month'), [monthOffset]);
    const calendar = useMemo(() => {
        const start = month.startOf('month');
        const days = month.daysInMonth();
        const dow = start.day();
        const pad = dow === 0 ? 6 : dow - 1; // Monday start
        const cells: Array<{ date: string; day: number; entries: CheckinEntry[]; today: boolean; empty: boolean }> = [];
        for (let i = 0; i < pad; i++) cells.push({ date: '', day: 0, entries: [], today: false, empty: true });
        for (let d = 1; d <= days; d++) {
            const dt = start.date(d);
            const key = dt.format('YYYY-MM-DD');
            cells.push({ date: key, day: d, entries: grouped.get(key) || [], today: dt.isSame(dayjs(), 'day'), empty: false });
        }
        return cells;
    }, [month, grouped]);

    // Mood summary
    const summary = useMemo(() => {
        const ms = month.startOf('month');
        const me = month.endOf('month');
        const counts: Record<string, number> = {};
        entries.filter(e => { const d = dayjs(e.created_at); return d.isAfter(ms.subtract(1, 'day')) && d.isBefore(me.add(1, 'day')); })
            .forEach(e => { counts[e.mood_level] = (counts[e.mood_level] || 0) + 1; });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 4);
    }, [entries, month]);

    const dayLabel = (date: string) => {
        const d = dayjs(date);
        const now = dayjs();
        if (d.isSame(now, 'day')) return { num: d.format('D'), mo: d.format('MMM'), text: 'Today', sub: d.format('dddd') };
        if (d.isSame(now.subtract(1, 'day'), 'day')) return { num: d.format('D'), mo: d.format('MMM'), text: 'Yesterday', sub: d.format('dddd') };
        return { num: d.format('D'), mo: d.format('MMM'), text: d.format('dddd'), sub: '' };
    };

    // Unified emoji component - uses Text for consistent cross-platform rendering
    const Emoji = ({ code, size = 20 }: { code: string; size?: number }) => (
        <Text style={{ fontSize: size, lineHeight: size * 1.2, textAlign: 'center' }}>{code}</Text>
    );

    // Week View Card
    const WeekCard = ({ entry }: { entry: CheckinEntry }) => {
        const emoji = MOOD_EMOJI[entry.mood_level] || '😐';
        const bg = MOOD_CARD_BG[entry.mood_level] || '#F9FAFB';
        const time = dayjs(entry.created_at).format('h:mm A');
        const tags = getMoodTags(entry);
        const scale = useRef(new Animated.Value(1)).current;

        return (
            <Pressable
                onPressIn={() => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, stiffness: 400, damping: 18 }).start()}
                onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, stiffness: 400, damping: 18 }).start()}
            >
                <Animated.View style={[styles.card, { backgroundColor: bg, transform: [{ scale }] }]}>
                    <View style={styles.cardTop}>
                        <View style={styles.cardLeft}>
                            <Emoji code={emoji} size={22} />
                            <ThemedText style={styles.cardMood}>{entry.mood_level}</ThemedText>
                        </View>
                        <ThemedText style={styles.cardTime}>{time}</ThemedText>
                    </View>
                    {tags.length > 0 && (
                        <View style={styles.cardTags}>
                            {tags.map((t, i) => (
                                <View key={i} style={styles.tag}>
                                    <ThemedText style={styles.tagText}>{t}</ThemedText>
                                </View>
                            ))}
                        </View>
                    )}
                </Animated.View>
            </Pressable>
        );
    };

    // Calendar Day Cell
    const CalCell = ({ cell }: { cell: typeof calendar[0] }) => {
        if (cell.empty) return <View style={styles.cell} />;
        const has = cell.entries.length > 0;
        const latest = has ? cell.entries[cell.entries.length - 1] : null;
        const emoji = latest ? MOOD_EMOJI[latest.mood_level] || '😐' : null;
        const color = latest ? MOOD_CIRCLE_COLOR[latest.mood_level] || '#E5E7EB' : '#F3F4F6';

        return (
            <Pressable style={styles.cell} onPress={() => has && doHaptic('light')}>
                <View style={[styles.circle, { backgroundColor: color }]}>
                    {emoji ? <Emoji code={emoji} size={16} /> : <ThemedText style={styles.plus}>+</ThemedText>}
                </View>
                <ThemedText style={[styles.cellDay, cell.today && styles.cellDayToday]}>{cell.day}</ThemedText>
            </Pressable>
        );
    };

    const WeekView = () => (
        <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.scrollPad, { paddingBottom: insets.bottom + 100 }]}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchEntries(true)} tintColor={BRAND_GREEN} colors={[BRAND_GREEN]} />}
        >
            {week.map(date => {
                const dayEntries = grouped.get(date);
                if (!dayEntries?.length) return null;
                const { num, mo, text, sub } = dayLabel(date);
                return (
                    <View key={date} style={styles.dayBlock}>
                        <View style={styles.dayRow}>
                            <View style={styles.dayNum}>
                                <ThemedText style={styles.dayNumText}>{num}</ThemedText>
                                <ThemedText style={styles.dayMo}>{mo}</ThemedText>
                            </View>
                            <View>
                                <ThemedText style={styles.dayText}>{text}</ThemedText>
                                {sub ? <ThemedText style={styles.daySub}>{sub}</ThemedText> : null}
                            </View>
                        </View>
                        {dayEntries.map(e => <WeekCard key={e.checkin_id} entry={e} />)}
                    </View>
                );
            })}
            {entries.length === 0 && (
                <View style={styles.empty}>
                    <View style={styles.emptyIcon}><Emoji code="🌱" size={44} /></View>
                    <ThemedText style={styles.emptyTitle}>No mood entries yet</ThemedText>
                    <ThemedText style={styles.emptySub}>Start tracking how you feel each day</ThemedText>
                    <Pressable style={styles.emptyBtn} onPress={() => { doHaptic(); router.push('/(student)/(tabs)/mood'); }}>
                        <ThemedText style={styles.emptyBtnText}>Check In Now</ThemedText>
                    </Pressable>
                </View>
            )}
        </ScrollView>
    );

    const MonthView = () => (
        <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.scrollPad, { paddingBottom: insets.bottom + 100 }]}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchEntries(true)} tintColor={BRAND_GREEN} colors={[BRAND_GREEN]} />}
        >
            <View style={styles.monthNav}>
                <Pressable style={styles.monthArrow} onPress={() => { doHaptic('light'); setMonthOffset(m => m - 1); }}>
                    <Icon name="chevron-left" size={20} color="#374151" />
                </Pressable>
                <ThemedText style={styles.monthTitle}>{month.format('MMMM YYYY')}</ThemedText>
                <Pressable style={styles.monthArrow} onPress={() => { doHaptic('light'); setMonthOffset(m => m + 1); }}>
                    <Icon name="chevron-right" size={20} color="#374151" />
                </Pressable>
            </View>
            <View style={styles.weekRow}>
                {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(d => (
                    <ThemedText key={d} style={styles.weekLabel}>{d}</ThemedText>
                ))}
            </View>
            <View style={styles.grid}>
                {calendar.map((c, i) => <CalCell key={i} cell={c} />)}
            </View>
            <View style={styles.summaryBox}>
                <ThemedText style={styles.summaryTitle}>Mood summary</ThemedText>
                {summary.length > 0 ? (
                    <View style={styles.summaryRow}>
                        {summary.map(([mood, count]) => (
                            <View key={mood} style={styles.summaryItem}>
                                <View style={[styles.summaryCircle, { backgroundColor: MOOD_CIRCLE_COLOR[mood] || '#E5E7EB' }]}>
                                    <Emoji code={MOOD_EMOJI[mood] || '😐'} size={20} />
                                </View>
                                <ThemedText style={styles.summaryLabel}>{mood}</ThemedText>
                                <ThemedText style={styles.summaryCount}>{count}x</ThemedText>
                            </View>
                        ))}
                    </View>
                ) : (
                    <ThemedText style={styles.summaryNone}>No entries this month</ThemedText>
                )}
            </View>
        </ScrollView>
    );

    return (
        <GlobalScreenWrapper backgroundColor="#FFFFFF">
            <Animated.View style={[styles.header, fadeUp(entrance.header)]}>
                <Pressable onPress={() => { doHaptic(); router.back(); }} style={styles.headerBtn}>
                    <Icon name="chevron-left" size={22} color="#374151" />
                </Pressable>
                <View style={styles.seg} onLayout={e => setSegW(e.nativeEvent.layout.width)}>
                    {Platform.OS !== 'web' && <Animated.View pointerEvents="none" style={[styles.segInd, indicatorStyle]} />}
                    <Pressable style={[styles.segBtn, Platform.OS === 'web' && tab === 0 && styles.segBtnActive]} onPress={() => switchTab(0)}>
                        <ThemedText style={[styles.segText, tab === 0 && styles.segTextActive]}>Week</ThemedText>
                    </Pressable>
                    <Pressable style={[styles.segBtn, Platform.OS === 'web' && tab === 1 && styles.segBtnActive]} onPress={() => switchTab(1)}>
                        <ThemedText style={[styles.segText, tab === 1 && styles.segTextActive]}>Month</ThemedText>
                    </Pressable>
                </View>
                <Pressable style={styles.headerBtn}><Icon name="search" size={20} color="#374151" /></Pressable>
            </Animated.View>

            <Animated.View style={[{ flex: 1 }, fadeUp(entrance.content)]}>
                {loading && !refreshing ? (
                    <View style={styles.center}><ThemedText style={styles.loadText}>Loading...</ThemedText></View>
                ) : error ? (
                    <View style={styles.center}>
                        <Icon name="alert-circle" size={44} color="#DC2626" />
                        <ThemedText style={styles.errText}>{error}</ThemedText>
                        <Pressable style={styles.retryBtn} onPress={() => fetchEntries()}>
                            <ThemedText style={styles.retryText}>Try Again</ThemedText>
                        </Pressable>
                    </View>
                ) : (
                    <Animated.View style={{ flex: 1, opacity: contentFade }}>
                        {tab === 0 ? <WeekView /> : <MonthView />}
                    </Animated.View>
                )}
            </Animated.View>
        </GlobalScreenWrapper>
    );
}

const styles = StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, gap: 12 },
    headerBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    seg: { flex: 1, maxWidth: 180, flexDirection: 'row', backgroundColor: '#F3F4F6', borderRadius: 24, padding: 4 },
    segInd: { position: 'absolute', top: 4, left: 4, bottom: 4, backgroundColor: '#FFF', borderRadius: 20, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
    segBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 20 },
    segBtnActive: { backgroundColor: '#FFF' },
    segText: { fontSize: 14, fontFamily: 'Inter_500Medium', color: '#6B7280' },
    segTextActive: { color: '#111827', fontFamily: 'Inter_600SemiBold' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    loadText: { fontSize: 15, color: '#6B7280' },
    errText: { fontSize: 15, color: '#DC2626', marginTop: 10, textAlign: 'center' },
    retryBtn: { marginTop: 14, backgroundColor: '#F3F4F6', paddingVertical: 10, paddingHorizontal: 22, borderRadius: 50 },
    retryText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#374151' },
    scroll: { flex: 1 },
    scrollPad: { paddingHorizontal: 16, paddingTop: 6 },

    // Week View
    dayBlock: { marginBottom: 18 },
    dayRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
    dayNum: { width: 34, alignItems: 'center' },
    dayNumText: { fontSize: 20, fontFamily: 'Inter_700Bold', color: '#111827', lineHeight: 24 },
    dayMo: { fontSize: 10, fontFamily: 'Inter_500Medium', color: '#9CA3AF', textTransform: 'uppercase' },
    dayText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#111827' },
    daySub: { fontSize: 12, color: '#6B7280' },
    card: { borderRadius: 14, padding: 12, marginBottom: 8, marginLeft: 44 },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cardMood: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#111827' },
    cardTime: { fontSize: 11, fontFamily: 'Inter_500Medium', color: '#6B7280' },
    cardTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 },
    tag: { backgroundColor: 'rgba(255,255,255,0.75)', paddingVertical: 3, paddingHorizontal: 9, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' },
    tagText: { fontSize: 11, fontFamily: 'Inter_500Medium', color: '#374151' },

    // Month View
    monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 14 },
    monthArrow: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    monthTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold', color: '#111827' },
    weekRow: { flexDirection: 'row', marginBottom: 6 },
    weekLabel: { flex: 1, textAlign: 'center', fontSize: 10, fontFamily: 'Inter_500Medium', color: '#9CA3AF' },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    cell: { width: '14.28%', alignItems: 'center', paddingVertical: 3, marginBottom: 6 },
    circle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    plus: { fontSize: 16, color: '#D1D5DB' },
    cellDay: { fontSize: 10, fontFamily: 'Inter_500Medium', color: '#6B7280', marginTop: 3 },
    cellDayToday: { color: '#0D8C4F', fontFamily: 'Inter_700Bold' },
    summaryBox: { marginTop: 20, paddingTop: 18, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
    summaryTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#111827', marginBottom: 14 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-around' },
    summaryItem: { alignItems: 'center' },
    summaryCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 5 },
    summaryLabel: { fontSize: 11, fontFamily: 'Inter_500Medium', color: '#374151' },
    summaryCount: { fontSize: 10, color: '#9CA3AF', marginTop: 2 },
    summaryNone: { fontSize: 13, color: '#9CA3AF', textAlign: 'center' },

    // Empty
    empty: { alignItems: 'center', paddingVertical: 50 },
    emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
    emptyTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold', color: '#111827', marginBottom: 5 },
    emptySub: { fontSize: 13, color: '#6B7280', marginBottom: 18 },
    emptyBtn: { backgroundColor: '#0D8C4F', paddingVertical: 11, paddingHorizontal: 26, borderRadius: 50 },
    emptyBtnText: { color: '#FFF', fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});
