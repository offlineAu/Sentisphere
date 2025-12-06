import { StyleSheet, View, ScrollView, Pressable, Animated, Easing, Platform, RefreshControl } from 'react-native';
import { useState, useEffect, useRef, useCallback } from 'react';
import { ThemedText } from '@/components/themed-text';
import { GlobalScreenWrapper } from '@/components/GlobalScreenWrapper';
import { Icon } from '@/components/ui/icon';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { parseTimestamp } from '@/utils/time';
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

const MOOD_EMOJI_MAP: Record<string, string> = {
    'Awesome': '🤩',
    'Great': '😊',
    'Loved': '🥰',
    'Okay': '😐',
    'Meh': '😒',
    'Anxious': '😨',
    'Bad': '😢',
    'Terrible': '😫',
    'Upset': '😡',
    'Neutral': '😐',
};

const ENERGY_EMOJI_MAP: Record<string, string> = {
    'Very High': '⚡',
    'High': '🔥',
    'Moderate': '✨',
    'Low': '🌙',
    'Very Low': '😴',
};

const STRESS_EMOJI_MAP: Record<string, string> = {
    'No Stress': '😌',
    'Low Stress': '🙂',
    'Moderate': '😐',
    'High Stress': '😓',
    'Very High': '🤯',
};

const MOOD_COLOR_MAP: Record<string, string> = {
    'Awesome': '#FB923C',
    'Great': '#FBBF24',
    'Loved': '#FDBA74',
    'Okay': '#FDE68A',
    'Meh': '#9CA3AF',
    'Anxious': '#6EE7B7',
    'Bad': '#7DD3FC',
    'Terrible': '#C4B5FD',
    'Upset': '#FCA5A5',
    'Neutral': '#E5E7EB',
};

export default function MoodHistoryScreen() {
    const [entries, setEntries] = useState<CheckinEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const scheme = useColorScheme() ?? 'light';
    const palette = Colors[scheme] as any;
    const insets = useSafeAreaInsets();
    const API = process.env.EXPO_PUBLIC_API_URL || 'https://sentisphere-production.up.railway.app';

    // Entrance animations
    const entrance = useRef({
        header: new Animated.Value(0),
        content: new Animated.Value(0),
    }).current;

    const runEntrance = useCallback(() => {
        entrance.header.setValue(0);
        entrance.content.setValue(0);
        Animated.stagger(120, [
            Animated.timing(entrance.header, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            Animated.timing(entrance.content, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]).start();
    }, []);

    const makeFadeUp = (v: Animated.Value) => ({
        opacity: v,
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
    });

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
            if (!token) {
                setError('Not signed in');
                return;
            }

            const res = await fetch(`${API}/api/emotional-checkins?days=31&limit=100`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (!res.ok) {
                throw new Error(`Failed to load entries: ${res.status}`);
            }

            const data = await res.json();
            // API returns array directly
            setEntries(Array.isArray(data) ? data : []);
        } catch (e: any) {
            setError(e?.message || 'Failed to load mood history');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [API]);

    useEffect(() => {
        fetchEntries();
    }, [fetchEntries]);

    useFocusEffect(
        useCallback(() => {
            runEntrance();
            fetchEntries();
            return () => { };
        }, [runEntrance, fetchEntries])
    );

    const formatDateTime = (isoString: string) => {
        const date = dayjs(isoString);
        const now = dayjs();
        const isToday = date.isSame(now, 'day');
        const isYesterday = date.isSame(now.subtract(1, 'day'), 'day');

        const timeStr = date.format('h:mm A');

        if (isToday) return `Today at ${timeStr}`;
        if (isYesterday) return `Yesterday at ${timeStr}`;
        return date.format('MMM D') + ` at ${timeStr}`;
    };

    const EntryCard = ({ entry, index }: { entry: CheckinEntry; index: number }) => {
        const moodEmoji = MOOD_EMOJI_MAP[entry.mood_level] || '😐';
        const energyEmoji = ENERGY_EMOJI_MAP[entry.energy_level] || '✨';
        const stressEmoji = STRESS_EMOJI_MAP[entry.stress_level] || '😐';
        const moodColor = MOOD_COLOR_MAP[entry.mood_level] || '#E5E7EB';

        const scale = useRef(new Animated.Value(1)).current;
        const handlePressIn = () => {
            Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, stiffness: 300, damping: 15 }).start();
        };
        const handlePressOut = () => {
            Animated.spring(scale, { toValue: 1, useNativeDriver: true, stiffness: 300, damping: 15 }).start();
        };

        return (
            <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut}>
                <Animated.View style={[styles.entryCard, { transform: [{ scale }] }]}>
                    {/* Header with mood and time */}
                    <View style={styles.entryHeader}>
                        <View style={[styles.moodBadge, { backgroundColor: `${moodColor}20` }]}>
                            <ThemedText style={styles.moodEmoji}>{moodEmoji}</ThemedText>
                            <ThemedText style={[styles.moodLabel, { color: moodColor }]}>{entry.mood_level}</ThemedText>
                        </View>
                        <ThemedText style={styles.entryTime}>{formatDateTime(entry.created_at)}</ThemedText>
                    </View>

                    {/* Details row */}
                    <View style={styles.detailsRow}>
                        <View style={styles.detailItem}>
                            <ThemedText style={styles.detailEmoji}>{energyEmoji}</ThemedText>
                            <ThemedText style={styles.detailLabel}>{entry.energy_level}</ThemedText>
                        </View>
                        <View style={styles.detailDivider} />
                        <View style={styles.detailItem}>
                            <ThemedText style={styles.detailEmoji}>{stressEmoji}</ThemedText>
                            <ThemedText style={styles.detailLabel}>{entry.stress_level}</ThemedText>
                        </View>
                    </View>

                    {/* Comment if present */}
                    {entry.comment && (
                        <View style={styles.commentSection}>
                            <ThemedText style={styles.commentText} numberOfLines={3}>
                                "{entry.comment}"
                            </ThemedText>
                        </View>
                    )}
                </Animated.View>
            </Pressable>
        );
    };

    return (
        <GlobalScreenWrapper backgroundColor="#FFFFFF">
            {/* Header */}
            <Animated.View style={[styles.header, makeFadeUp(entrance.header)]}>
                <Pressable onPress={() => router.back()} style={styles.backButton}>
                    <Icon name="chevron-left" size={24} color="#111827" />
                </Pressable>
                <ThemedText style={styles.headerTitle}>Mood Log</ThemedText>
                <View style={{ width: 40 }} />
            </Animated.View>

            {/* Content */}
            <Animated.View style={[{ flex: 1 }, makeFadeUp(entrance.content)]}>
                {loading && !refreshing ? (
                    <View style={styles.centerContainer}>
                        <ThemedText style={styles.loadingText}>Loading your mood history...</ThemedText>
                    </View>
                ) : error ? (
                    <View style={styles.centerContainer}>
                        <Icon name="alert-circle" size={48} color="#DC2626" />
                        <ThemedText style={styles.errorText}>{error}</ThemedText>
                        <Pressable style={styles.retryButton} onPress={() => fetchEntries()}>
                            <ThemedText style={styles.retryButtonText}>Try Again</ThemedText>
                        </Pressable>
                    </View>
                ) : entries.length === 0 ? (
                    <View style={styles.centerContainer}>
                        <View style={styles.emptyIconWrap}>
                            <Icon name="smile" size={48} color="#9CA3AF" />
                        </View>
                        <ThemedText style={styles.emptyTitle}>No check-ins yet</ThemedText>
                        <ThemedText style={styles.emptySubtitle}>
                            Start tracking your mood to see your history here
                        </ThemedText>
                        <Pressable style={styles.checkinButton} onPress={() => router.push('/(student)/(tabs)/mood')}>
                            <ThemedText style={styles.checkinButtonText}>Check In Now</ThemedText>
                        </Pressable>
                    </View>
                ) : (
                    <ScrollView
                        style={styles.scrollView}
                        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
                        showsVerticalScrollIndicator={false}
                        refreshControl={
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={() => fetchEntries(true)}
                                tintColor="#0D8C4F"
                                colors={['#0D8C4F']}
                            />
                        }
                    >
                        <ThemedText style={styles.sectionTitle}>
                            {entries.length} {entries.length === 1 ? 'check-in' : 'check-ins'} this month
                        </ThemedText>
                        {entries.map((entry, index) => (
                            <EntryCard key={entry.checkin_id} entry={entry} index={index} />
                        ))}
                    </ScrollView>
                )}
            </Animated.View>
        </GlobalScreenWrapper>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F3F4F6',
    },
    headerTitle: {
        fontSize: 18,
        fontFamily: 'Inter_600SemiBold',
        color: '#111827',
    },
    centerContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    loadingText: {
        fontSize: 16,
        color: '#6B7280',
    },
    errorText: {
        fontSize: 16,
        color: '#DC2626',
        textAlign: 'center',
        marginTop: 12,
    },
    retryButton: {
        marginTop: 16,
        backgroundColor: '#F3F4F6',
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 50,
    },
    retryButtonText: {
        fontSize: 14,
        fontFamily: 'Inter_600SemiBold',
        color: '#374151',
    },
    emptyIconWrap: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    emptyTitle: {
        fontSize: 18,
        fontFamily: 'Inter_600SemiBold',
        color: '#111827',
        marginBottom: 8,
    },
    emptySubtitle: {
        fontSize: 14,
        color: '#6B7280',
        textAlign: 'center',
        marginBottom: 20,
    },
    checkinButton: {
        backgroundColor: '#0D8C4F',
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 50,
    },
    checkinButtonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontFamily: 'Inter_600SemiBold',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 16,
        paddingTop: 8,
    },
    sectionTitle: {
        fontSize: 14,
        fontFamily: 'Inter_500Medium',
        color: '#6B7280',
        marginBottom: 12,
    },
    entryCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        padding: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },
    entryHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    moodBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 50,
        gap: 6,
    },
    moodEmoji: {
        fontSize: 20,
        lineHeight: 26,
    },
    moodLabel: {
        fontSize: 14,
        fontFamily: 'Inter_600SemiBold',
    },
    entryTime: {
        fontSize: 13,
        color: '#9CA3AF',
        fontFamily: 'Inter_500Medium',
    },
    detailsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F9FAFB',
        borderRadius: 12,
        padding: 12,
    },
    detailItem: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    detailDivider: {
        width: 1,
        height: 24,
        backgroundColor: '#E5E7EB',
    },
    detailEmoji: {
        fontSize: 18,
        lineHeight: 24,
    },
    detailLabel: {
        fontSize: 13,
        color: '#374151',
        fontFamily: 'Inter_500Medium',
    },
    commentSection: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
    },
    commentText: {
        fontSize: 14,
        color: '#6B7280',
        fontStyle: 'italic',
        lineHeight: 20,
    },
});
