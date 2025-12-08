import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    ScrollView,
    Animated,
    Easing,
    Platform,
} from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Icon } from '@/components/ui/icon'
import * as Haptics from 'expo-haptics'
import { setTermsAccepted } from '@/utils/onboarding'

// Terms content - derived from app features
const TERMS_ITEMS = [
    {
        id: 'acceptance',
        title: 'Acceptance of Terms',
        description: 'By using Sentisphere, you agree to these Terms & Conditions. If you do not agree, please do not use this application.',
    },
    {
        id: 'service',
        title: 'Service Description',
        description: 'Sentisphere is an emotional wellness application designed to support student emotional wellness through mood tracking, journaling, and educational resources.',
    },
    {
        id: 'data',
        title: 'Data Collection & Usage',
        description: 'We collect mood check-ins, journal entries, and user interactions to provide personalized wellness insights. Your data is stored securely and used solely to improve your experience.',
    },
    {
        id: 'disclaimer',
        title: 'Educational Content Disclaimer',
        description: 'Wellness content provided in Sentisphere is for educational purposes only. This application does not provide medical advice, diagnosis, or treatment.',
    },
    {
        id: 'security',
        title: 'Account Security',
        description: 'You are responsible for maintaining the confidentiality of your login credentials. Do not share your account with others.',
    },
    {
        id: 'liability',
        title: 'Limitation of Liability',
        description: 'Sentisphere is a wellness support tool and is not a substitute for professional mental health services. In case of emergency, please contact a trusted adult, counselor, or emergency services.',
    },
    {
        id: 'privacy',
        title: 'Privacy Policy',
        description: 'Your personal information is protected in accordance with applicable privacy laws. We do not sell or share your data with third parties for marketing purposes.',
    },
]

export default function TermsScreen() {
    const insets = useSafeAreaInsets()
    const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set())
    const allChecked = checkedItems.size === TERMS_ITEMS.length

    // Entrance animations
    const headerAnim = useRef(new Animated.Value(0)).current
    const itemAnims = useRef(TERMS_ITEMS.map(() => new Animated.Value(0))).current
    const buttonAnim = useRef(new Animated.Value(0)).current

    // Checkbox animations
    const checkAnims = useRef<{ [key: string]: Animated.Value }>(
        Object.fromEntries(TERMS_ITEMS.map(item => [item.id, new Animated.Value(0)]))
    ).current

    const runEntrance = useCallback(() => {
        // Reset
        headerAnim.setValue(0)
        itemAnims.forEach(a => a.setValue(0))
        buttonAnim.setValue(0)

        // Header fade in
        Animated.timing(headerAnim, {
            toValue: 1,
            duration: 400,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start()

        // Staggered items
        Animated.stagger(
            80,
            itemAnims.map(anim =>
                Animated.timing(anim, {
                    toValue: 1,
                    duration: 350,
                    easing: Easing.out(Easing.back(1.1)),
                    useNativeDriver: true,
                })
            )
        ).start()

        // Button slides up after items
        Animated.timing(buttonAnim, {
            toValue: 1,
            duration: 400,
            delay: TERMS_ITEMS.length * 80 + 100,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
        }).start()
    }, [headerAnim, itemAnims, buttonAnim])

    useEffect(() => {
        runEntrance()
    }, [runEntrance])

    const toggleItem = (id: string) => {
        if (Platform.OS !== 'web') {
            try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light) } catch { }
        }

        const newChecked = new Set(checkedItems)
        const isNowChecked = !newChecked.has(id)

        if (isNowChecked) {
            newChecked.add(id)
        } else {
            newChecked.delete(id)
        }
        setCheckedItems(newChecked)

        // Animate checkbox
        Animated.spring(checkAnims[id], {
            toValue: isNowChecked ? 1 : 0,
            stiffness: 400,
            damping: 15,
            mass: 0.8,
            useNativeDriver: true,
        }).start()
    }

    const handleAccept = async () => {
        if (!allChecked) return

        if (Platform.OS !== 'web') {
            try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) } catch { }
        }

        // Save acceptance
        await setTermsAccepted()

        // Navigate to auth
        router.replace('/auth')
    }

    const makeItemStyle = (anim: Animated.Value) => ({
        opacity: anim,
        transform: [
            { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) },
        ],
    })

    return (
        <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
            {/* Header */}
            <Animated.View
                style={[
                    styles.header,
                    {
                        opacity: headerAnim,
                        transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }],
                    },
                ]}
            >
                {/* Modern icon badge */}
                <View style={styles.iconBadge}>
                    <Icon name="check-circle" size={28} color="#0d8c4f" />
                </View>
                <Text style={styles.title}>Terms & Conditions</Text>
                <Text style={styles.subtitle}>
                    Please read and acknowledge the following terms before using Sentisphere.
                </Text>
            </Animated.View>

            {/* Scrollable terms list */}
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {TERMS_ITEMS.map((item, index) => {
                    const isChecked = checkedItems.has(item.id)
                    const checkScale = checkAnims[item.id].interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [1, 1.2, 1],
                    })

                    return (
                        <Animated.View key={item.id} style={makeItemStyle(itemAnims[index])}>
                            <Pressable
                                onPress={() => toggleItem(item.id)}
                                style={({ pressed }) => [
                                    styles.termItem,
                                    pressed && styles.termItemPressed,
                                    isChecked && styles.termItemChecked,
                                ]}
                            >
                                {/* Checkbox */}
                                <Animated.View
                                    style={[
                                        styles.checkbox,
                                        isChecked && styles.checkboxChecked,
                                        { transform: [{ scale: checkScale }] },
                                    ]}
                                >
                                    {isChecked && (
                                        <Icon name="check" size={14} color="#FFFFFF" />
                                    )}
                                </Animated.View>

                                {/* Content */}
                                <View style={styles.termContent}>
                                    <Text style={styles.termTitle}>{item.title}</Text>
                                    <Text style={styles.termDescription}>{item.description}</Text>
                                </View>
                            </Pressable>
                        </Animated.View>
                    )
                })}
            </ScrollView>

            {/* Accept button */}
            <Animated.View
                style={[
                    styles.buttonWrapper,
                    { paddingBottom: insets.bottom + 16 },
                    {
                        opacity: buttonAnim,
                        transform: [{ translateY: buttonAnim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }],
                    },
                ]}
            >
                <Pressable
                    onPress={handleAccept}
                    disabled={!allChecked}
                    style={({ pressed }) => [
                        styles.acceptButton,
                        !allChecked && styles.acceptButtonDisabled,
                        pressed && allChecked && styles.acceptButtonPressed,
                    ]}
                >
                    <Text style={[styles.acceptButtonText, !allChecked && styles.acceptButtonTextDisabled]}>
                        Accept
                    </Text>
                </Pressable>

                {/* Progress indicator */}
                <Text style={styles.progress}>
                    {checkedItems.size} of {TERMS_ITEMS.length} acknowledged
                </Text>
            </Animated.View>
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    header: {
        paddingHorizontal: 24,
        marginBottom: 16,
        alignItems: 'center',
    },
    iconBadge: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#F0FDF4',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
        shadowColor: '#0d8c4f',
        shadowOpacity: 0.15,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 3,
    },
    title: {
        fontSize: 28,
        fontFamily: 'Inter_700Bold',
        color: '#111827',
        marginBottom: 8,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 15,
        fontFamily: 'Inter_400Regular',
        color: '#6B7280',
        lineHeight: 22,
        textAlign: 'center',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingBottom: 20,
    },
    termItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '#F9FAFB',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    termItemPressed: {
        backgroundColor: '#F3F4F6',
    },
    termItemChecked: {
        backgroundColor: '#F0FDF4',
        borderColor: '#86EFAC',
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: '#D1D5DB',
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
        marginTop: 2,
    },
    checkboxChecked: {
        backgroundColor: '#0d8c4f',
        borderColor: '#0d8c4f',
    },
    termContent: {
        flex: 1,
    },
    termTitle: {
        fontSize: 15,
        fontFamily: 'Inter_600SemiBold',
        color: '#111827',
        marginBottom: 4,
    },
    termDescription: {
        fontSize: 13,
        fontFamily: 'Inter_400Regular',
        color: '#6B7280',
        lineHeight: 19,
    },
    buttonWrapper: {
        paddingHorizontal: 20,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
        backgroundColor: '#FFFFFF',
    },
    acceptButton: {
        height: 56,
        borderRadius: 16,
        backgroundColor: '#0d8c4f',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.12,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 4,
    },
    acceptButtonDisabled: {
        backgroundColor: '#D1D5DB',
        shadowOpacity: 0,
        elevation: 0,
    },
    acceptButtonPressed: {
        opacity: 0.9,
        transform: [{ scale: 0.98 }],
    },
    acceptButtonText: {
        fontSize: 18,
        fontFamily: 'Inter_600SemiBold',
        color: '#FFFFFF',
    },
    acceptButtonTextDisabled: {
        color: '#9CA3AF',
    },
    progress: {
        fontSize: 13,
        fontFamily: 'Inter_500Medium',
        color: '#9CA3AF',
        textAlign: 'center',
        marginTop: 12,
    },
})
