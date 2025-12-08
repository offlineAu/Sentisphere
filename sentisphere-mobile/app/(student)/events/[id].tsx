import { StyleSheet, View, ScrollView, Pressable, Animated, Easing, Platform, Dimensions } from 'react-native'
import { useEffect, useRef, useState } from 'react'
import { useLocalSearchParams, router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import * as Haptics from 'expo-haptics'
import { ThemedText } from '@/components/themed-text'
import { Icon } from '@/components/ui/icon'
import { GlobalScreenWrapper } from '@/components/GlobalScreenWrapper'

const { width } = Dimensions.get('window')

// Event data - in production this would come from an API
const EVENTS_DATA: Record<string, {
    id: string
    title: string
    description: string
    fullDescription: string
    category: string
    categoryIcon: string
    date: string
    time: string
    location: string
    attendees: number
    organizer: string
    organizerRole: string
    colors: [string, string, string]
    accentColor: string
}> = {
    wellness: {
        id: 'wellness',
        title: 'Wellness Workshop',
        description: 'Join us for mindfulness and self-care with the counseling team',
        fullDescription: 'Experience a transformative session focused on mental wellness and self-care techniques. Our expert counselors will guide you through mindfulness exercises, stress-relief strategies, and help you develop healthy coping mechanisms for academic and personal challenges.\n\nThis workshop is designed specifically for students who want to enhance their emotional well-being and learn practical skills they can apply in their daily lives.',
        category: 'Wellness',
        categoryIcon: 'heart',
        date: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
        time: '2:00 PM - 4:00 PM',
        location: 'CSM Building · Room 104',
        attendees: 45,
        organizer: 'Counseling Office',
        organizerRole: 'Official Organizer',
        colors: ['#065F46', '#0d8c4f', '#10B981'],
        accentColor: '#0d8c4f',
    },
    stress: {
        id: 'stress',
        title: 'Stress Relief Session',
        description: 'Learn breathing techniques and stress management strategies',
        fullDescription: 'Feeling overwhelmed? Join our stress relief session to learn powerful breathing techniques and stress management strategies that work. Led by certified wellness coaches, this interactive session will help you understand your stress triggers and develop personalized coping strategies.\n\nYou\'ll leave with practical tools to manage anxiety and stress in both academic and personal settings.',
        category: 'Relaxation',
        categoryIcon: 'sparkles',
        date: 'December 15, 2024',
        time: '10:00 AM - 12:00 PM',
        location: 'Main Auditorium',
        attendees: 78,
        organizer: 'Wellness Committee',
        organizerRole: 'Student Organization',
        colors: ['#7C3AED', '#8B5CF6', '#A78BFA'],
        accentColor: '#7C3AED',
    },
    counseling: {
        id: 'counseling',
        title: 'Group Counseling',
        description: 'Safe space to share experiences and support each other',
        fullDescription: 'Join a supportive group environment where you can share your experiences and learn from others facing similar challenges. Our trained counselors facilitate meaningful discussions in a safe, confidential setting.\n\nGroup counseling offers unique benefits including peer support, diverse perspectives, and the realization that you\'re not alone in your struggles. All conversations remain completely confidential.',
        category: 'Support',
        categoryIcon: 'message-circle',
        date: 'December 20, 2024',
        time: '3:00 PM - 5:00 PM',
        location: 'CSM Building · Room 104',
        attendees: 12,
        organizer: 'Guidance Office',
        organizerRole: 'Official Organizer',
        colors: ['#0369A1', '#0EA5E9', '#38BDF8'],
        accentColor: '#0369A1',
    },
}

export default function EventDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>()
    const insets = useSafeAreaInsets()
    const event = EVENTS_DATA[id] || EVENTS_DATA.wellness
    const [showSuccess, setShowSuccess] = useState(false)

    // Entrance animations
    const headerAnim = useRef(new Animated.Value(0)).current
    const contentAnim = useRef(new Animated.Value(0)).current
    const detailsAnim = useRef(new Animated.Value(0)).current
    const buttonAnim = useRef(new Animated.Value(0)).current

    // Success overlay animations
    const successOverlayAnim = useRef(new Animated.Value(0)).current
    const successIconAnim = useRef(new Animated.Value(0)).current
    const successTextAnim = useRef(new Animated.Value(0)).current
    const successSubtextAnim = useRef(new Animated.Value(0)).current
    const successButtonAnim = useRef(new Animated.Value(0)).current

    useEffect(() => {
        // Staggered entrance animation
        Animated.stagger(80, [
            Animated.timing(headerAnim, {
                toValue: 1,
                duration: 400,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.timing(contentAnim, {
                toValue: 1,
                duration: 400,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.timing(detailsAnim, {
                toValue: 1,
                duration: 400,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.timing(buttonAnim, {
                toValue: 1,
                duration: 400,
                easing: Easing.out(Easing.back(1.2)),
                useNativeDriver: true,
            }),
        ]).start()
    }, [])

    const showSuccessOverlay = () => {
        setShowSuccess(true)
        // Staggered success animation
        Animated.sequence([
            Animated.timing(successOverlayAnim, {
                toValue: 1,
                duration: 300,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }),
            Animated.stagger(100, [
                Animated.spring(successIconAnim, {
                    toValue: 1,
                    stiffness: 200,
                    damping: 12,
                    useNativeDriver: true,
                }),
                Animated.timing(successTextAnim, {
                    toValue: 1,
                    duration: 400,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
                Animated.timing(successSubtextAnim, {
                    toValue: 1,
                    duration: 400,
                    easing: Easing.out(Easing.cubic),
                    useNativeDriver: true,
                }),
                Animated.timing(successButtonAnim, {
                    toValue: 1,
                    duration: 400,
                    easing: Easing.out(Easing.back(1.1)),
                    useNativeDriver: true,
                }),
            ]),
        ]).start()
    }

    const makeFadeUp = (anim: Animated.Value, offset = 20) => ({
        opacity: anim,
        transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [offset, 0] }) },
        ],
    })

    const handleJoin = () => {
        if (Platform.OS !== 'web') {
            try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch { }
        }
        showSuccessOverlay()
    }

    const handleDismissSuccess = () => {
        if (Platform.OS !== 'web') {
            try { Haptics.selectionAsync() } catch { }
        }
        router.back()
    }

    const handleBack = () => {
        if (Platform.OS !== 'web') {
            try { Haptics.selectionAsync() } catch { }
        }
        router.back()
    }

    return (
        <GlobalScreenWrapper backgroundColor="#FFFFFF">
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
            >
                {/* Hero Gradient Header */}
                <Animated.View style={makeFadeUp(headerAnim, 30)}>
                    <LinearGradient
                        colors={event.colors}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.heroGradient}
                    >
                        {/* Decorative circles */}
                        <View style={[styles.decorCircle, styles.decorCircle1]} />
                        <View style={[styles.decorCircle, styles.decorCircle2]} />
                        <View style={[styles.decorCircle, styles.decorCircle3]} />

                        {/* Back Button */}
                        <Pressable
                            onPress={handleBack}
                            style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.8 }]}
                        >
                            <Icon name="arrow-left" size={20} color="#FFFFFF" />
                        </Pressable>

                        {/* Category Badge */}
                        <View style={styles.categoryBadge}>
                            <Icon name={event.categoryIcon as any} size={14} color="#FFFFFF" />
                            <ThemedText style={styles.categoryText}>{event.category}</ThemedText>
                        </View>

                        {/* Title */}
                        <ThemedText style={styles.heroTitle}>{event.title}</ThemedText>
                        <ThemedText style={styles.heroSubtitle}>{event.description}</ThemedText>
                    </LinearGradient>
                </Animated.View>

                {/* Event Details Cards */}
                <Animated.View style={[styles.detailsContainer, makeFadeUp(contentAnim)]}>
                    {/* Date & Time Card */}
                    <View style={styles.detailCard}>
                        <View style={[styles.detailIconWrap, { backgroundColor: `${event.accentColor}15` }]}>
                            <Icon name="calendar" size={20} color={event.accentColor} />
                        </View>
                        <View style={styles.detailTextWrap}>
                            <ThemedText style={styles.detailLabel}>Date & Time</ThemedText>
                            <ThemedText style={styles.detailValue}>{event.date}</ThemedText>
                            <ThemedText style={[styles.detailSubvalue, { color: event.accentColor }]}>{event.time}</ThemedText>
                        </View>
                    </View>

                    {/* Location Card */}
                    <View style={styles.detailCard}>
                        <View style={[styles.detailIconWrap, { backgroundColor: `${event.accentColor}15` }]}>
                            <Icon name="map-pin" size={20} color={event.accentColor} />
                        </View>
                        <View style={styles.detailTextWrap}>
                            <ThemedText style={styles.detailLabel}>Location</ThemedText>
                            <ThemedText style={styles.detailValue}>{event.location}</ThemedText>
                        </View>
                    </View>
                </Animated.View>

                {/* About Section */}
                <Animated.View style={[styles.section, makeFadeUp(detailsAnim)]}>
                    <ThemedText style={styles.sectionTitle}>About This Event</ThemedText>
                    <ThemedText style={styles.sectionText}>{event.fullDescription}</ThemedText>
                </Animated.View>

                {/* Attendees & Organizer */}
                <Animated.View style={[styles.section, makeFadeUp(detailsAnim)]}>
                    <View style={styles.statsRow}>
                        {/* Attendees */}
                        <View style={styles.statCard}>
                            <View style={[styles.statIconWrap, { backgroundColor: `${event.accentColor}15` }]}>
                                <Icon name="users" size={18} color={event.accentColor} />
                            </View>
                            <ThemedText style={styles.statValue}>{event.attendees}</ThemedText>
                            <ThemedText style={styles.statLabel}>Attending</ThemedText>
                        </View>

                        {/* Organizer */}
                        <View style={styles.statCard}>
                            <View style={[styles.statIconWrap, { backgroundColor: `${event.accentColor}15` }]}>
                                <Icon name="users" size={18} color={event.accentColor} />
                            </View>
                            <ThemedText style={styles.statValue}>{event.organizer}</ThemedText>
                            <ThemedText style={styles.statLabel}>{event.organizerRole}</ThemedText>
                        </View>
                    </View>
                </Animated.View>
            </ScrollView>

            {/* Fixed Bottom CTA */}
            <Animated.View style={[styles.bottomCTA, { paddingBottom: insets.bottom + 16 }, makeFadeUp(buttonAnim)]}>
                <LinearGradient
                    colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.95)', '#FFFFFF']}
                    style={styles.bottomGradient}
                />
                <Pressable
                    onPress={handleJoin}
                    style={({ pressed }) => [
                        styles.joinButton,
                        { backgroundColor: event.accentColor },
                        pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
                    ]}
                >
                    <ThemedText style={styles.joinButtonText}>Join This Event</ThemedText>
                    <Icon name="check-circle" size={20} color="#FFFFFF" />
                </Pressable>
            </Animated.View>

            {/* Success Overlay */}
            {showSuccess && (
                <Animated.View style={[styles.successOverlay, { opacity: successOverlayAnim }]}>
                    <LinearGradient
                        colors={event.colors}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.successGradient}
                    >
                        {/* Decorative circles */}
                        <View style={[styles.successDecor, styles.successDecor1]} />
                        <View style={[styles.successDecor, styles.successDecor2]} />
                        <View style={[styles.successDecor, styles.successDecor3]} />

                        {/* Success Icon */}
                        <Animated.View style={[
                            styles.successIconWrap,
                            {
                                opacity: successIconAnim,
                                transform: [
                                    { scale: successIconAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
                                ],
                            },
                        ]}>
                            <Icon name="check" size={48} color={event.accentColor} />
                        </Animated.View>

                        {/* Success Title */}
                        <Animated.View style={[
                            styles.successTextWrap,
                            {
                                opacity: successTextAnim,
                                transform: [{ translateY: successTextAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
                            },
                        ]}>
                            <ThemedText style={styles.successTitle}>You're In!</ThemedText>
                            <ThemedText style={styles.successEventName}>{event.title}</ThemedText>
                        </Animated.View>

                        {/* Success Message */}
                        <Animated.View style={[
                            styles.successMessageWrap,
                            {
                                opacity: successSubtextAnim,
                                transform: [{ translateY: successSubtextAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
                            },
                        ]}>
                            <View style={styles.successBellRow}>
                                <View style={styles.successBellIcon}>
                                    <Icon name="bell" size={18} color={event.accentColor} />
                                </View>
                                <ThemedText style={styles.successMessage}>
                                    We'll send you a reminder one day before the event starts. Mark your calendar!
                                </ThemedText>
                            </View>
                            <View style={styles.successInfoRow}>
                                <Icon name="calendar" size={14} color="rgba(255,255,255,0.7)" />
                                <ThemedText style={styles.successInfoText}>{event.date}</ThemedText>
                            </View>
                            <View style={styles.successInfoRow}>
                                <Icon name="map-pin" size={14} color="rgba(255,255,255,0.7)" />
                                <ThemedText style={styles.successInfoText}>{event.location}</ThemedText>
                            </View>
                        </Animated.View>

                        {/* Done Button */}
                        <Animated.View style={[
                            styles.successButtonWrap,
                            {
                                opacity: successButtonAnim,
                                transform: [
                                    { translateY: successButtonAnim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) },
                                ],
                            },
                        ]}>
                            <Pressable
                                onPress={handleDismissSuccess}
                                style={({ pressed }) => [styles.successDoneBtn, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
                            >
                                <ThemedText style={[styles.successDoneBtnText, { color: event.accentColor }]}>Back to Dashboard</ThemedText>
                                <Icon name="arrow-right" size={18} color={event.accentColor} />
                            </Pressable>
                        </Animated.View>
                    </LinearGradient>
                </Animated.View>
            )}
        </GlobalScreenWrapper>
    )
}

const styles = StyleSheet.create({
    scrollContent: {
        flexGrow: 1,
    },
    heroGradient: {
        paddingTop: 60,
        paddingBottom: 32,
        paddingHorizontal: 20,
        borderBottomLeftRadius: 32,
        borderBottomRightRadius: 32,
        position: 'relative',
        overflow: 'hidden',
    },
    decorCircle: {
        position: 'absolute',
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    decorCircle1: {
        width: 180,
        height: 180,
        top: -60,
        right: -40,
    },
    decorCircle2: {
        width: 120,
        height: 120,
        bottom: -40,
        left: -30,
    },
    decorCircle3: {
        width: 80,
        height: 80,
        top: 60,
        left: width * 0.6,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    categoryBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        alignSelf: 'flex-start',
        marginBottom: 16,
    },
    categoryText: {
        fontSize: 13,
        fontFamily: 'Inter_600SemiBold',
        color: '#FFFFFF',
    },
    heroTitle: {
        fontSize: 28,
        fontFamily: 'Inter_700Bold',
        color: '#FFFFFF',
        marginBottom: 8,
    },
    heroSubtitle: {
        fontSize: 16,
        fontFamily: 'Inter_400Regular',
        color: 'rgba(255,255,255,0.9)',
        lineHeight: 24,
    },
    detailsContainer: {
        paddingHorizontal: 16,
        marginTop: -20,
        gap: 12,
    },
    detailCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        gap: 14,
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 3,
    },
    detailIconWrap: {
        width: 48,
        height: 48,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    detailTextWrap: {
        flex: 1,
    },
    detailLabel: {
        fontSize: 12,
        fontFamily: 'Inter_500Medium',
        color: '#6B7280',
        marginBottom: 2,
    },
    detailValue: {
        fontSize: 15,
        fontFamily: 'Inter_600SemiBold',
        color: '#111827',
    },
    detailSubvalue: {
        fontSize: 14,
        fontFamily: 'Inter_500Medium',
        marginTop: 2,
    },
    section: {
        paddingHorizontal: 16,
        marginTop: 24,
    },
    sectionTitle: {
        fontSize: 18,
        fontFamily: 'Inter_700Bold',
        color: '#111827',
        marginBottom: 12,
    },
    sectionText: {
        fontSize: 15,
        fontFamily: 'Inter_400Regular',
        color: '#4B5563',
        lineHeight: 24,
    },
    statsRow: {
        flexDirection: 'row',
        gap: 12,
    },
    statCard: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },
    statIconWrap: {
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 10,
    },
    statValue: {
        fontSize: 16,
        fontFamily: 'Inter_700Bold',
        color: '#111827',
        textAlign: 'center',
    },
    statLabel: {
        fontSize: 12,
        fontFamily: 'Inter_400Regular',
        color: '#6B7280',
        marginTop: 2,
        textAlign: 'center',
    },
    bottomCTA: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 16,
        paddingTop: 20,
    },
    bottomGradient: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 60,
    },
    joinButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingVertical: 16,
        borderRadius: 16,
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 5,
    },
    joinButtonText: {
        fontSize: 16,
        fontFamily: 'Inter_600SemiBold',
        color: '#FFFFFF',
    },
    // Success Overlay Styles
    successOverlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 100,
    },
    successGradient: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
        position: 'relative',
        overflow: 'hidden',
    },
    successDecor: {
        position: 'absolute',
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    successDecor1: {
        width: 250,
        height: 250,
        top: -80,
        right: -80,
    },
    successDecor2: {
        width: 180,
        height: 180,
        bottom: -60,
        left: -50,
    },
    successDecor3: {
        width: 120,
        height: 120,
        top: '40%',
        left: -40,
    },
    successIconWrap: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 28,
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 8 },
        elevation: 8,
    },
    successTextWrap: {
        alignItems: 'center',
        marginBottom: 24,
    },
    successTitle: {
        fontSize: 32,
        fontFamily: 'Inter_700Bold',
        color: '#FFFFFF',
        marginBottom: 8,
    },
    successEventName: {
        fontSize: 18,
        fontFamily: 'Inter_600SemiBold',
        color: 'rgba(255,255,255,0.9)',
    },
    successMessageWrap: {
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 20,
        padding: 20,
        width: '100%',
        maxWidth: 360,
        gap: 12,
    },
    successBellRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
    },
    successBellIcon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    successMessage: {
        flex: 1,
        fontSize: 15,
        fontFamily: 'Inter_500Medium',
        color: '#FFFFFF',
        lineHeight: 22,
    },
    successInfoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginLeft: 48,
    },
    successInfoText: {
        fontSize: 14,
        fontFamily: 'Inter_400Regular',
        color: 'rgba(255,255,255,0.85)',
    },
    successButtonWrap: {
        position: 'absolute',
        bottom: 40,
        left: 24,
        right: 24,
    },
    successDoneBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        backgroundColor: '#FFFFFF',
        paddingVertical: 16,
        borderRadius: 16,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
    },
    successDoneBtnText: {
        fontSize: 16,
        fontFamily: 'Inter_600SemiBold',
    },
})
