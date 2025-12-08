import React, { useRef, useEffect, useState, useCallback } from 'react'
import { View, Text, StyleSheet, Pressable, Animated, Easing, Platform } from 'react-native'
import { Asset } from 'expo-asset'
import { router } from 'expo-router'
import { Colors } from '@/constants/theme'
import { Icon } from '@/components/ui/icon'
import * as Haptics from 'expo-haptics'
import { SvgUri } from 'react-native-svg'
import { hasAcceptedTerms } from '@/utils/onboarding'
import * as SecureStore from 'expo-secure-store'

// Floating icon configuration
const FLOATING_ICONS = [
  { name: 'calendar', color: '#7C3AED', top: 80, left: 28 },
  { name: 'map-pin', color: '#F97316', top: 130, right: 28 },
  { name: 'ticket', color: '#2563EB', top: 220, left: 36 },
  { name: 'party-popper', color: '#EC4899', top: 270, right: 40 },
  { name: 'globe-2', color: '#10B981', top: 360, left: 70 },
  { name: 'smile', color: '#A855F7', top: 380, right: 70 },
  { name: 'book-open', color: '#0EA5E9', top: 160, left: 120, size: 24 },
  { name: 'heart', color: '#EF4444', top: 320, right: 120, size: 24 },
  { name: 'sparkles', color: '#F59E0B', top: 440, left: 30, size: 24 },
  { name: 'bell', color: '#22C55E', top: 480, right: 40, size: 24 },
]

export default function SplashIntro() {
  const palette = Colors.light as any
  const logoSource: any = require('@/assets/images/logo.svg')
  const logoUri = Asset.fromModule(logoSource).uri
  const [isExiting, setIsExiting] = useState(false)
  const [isChecking, setIsChecking] = useState(true) // Check auth/terms on mount

  // Auto-redirect: If terms accepted AND authenticated, skip to student dashboard
  useEffect(() => {
    const checkAndRedirect = async () => {
      try {
        // Check if terms are accepted
        const termsAccepted = await hasAcceptedTerms()
        if (!termsAccepted) {
          // Terms not accepted - show splash, user needs to go through onboarding
          setIsChecking(false)
          return
        }

        // Check if user has auth token
        let token: string | null = null
        if (Platform.OS === 'web') {
          token = typeof window !== 'undefined' ? window.localStorage?.getItem('auth_token') ?? null : null
        } else {
          token = await SecureStore.getItemAsync('auth_token')
        }

        if (token) {
          // Both terms accepted AND has token - go directly to student dashboard
          router.replace('/(student)/(tabs)/dashboard')
        } else {
          // Terms accepted but no token - go to auth
          router.replace('/auth')
        }
      } catch (e) {
        // On error, show splash normally
        console.log('[Splash] Error checking auth/terms:', e)
        setIsChecking(false)
      }
    }

    checkAndRedirect()
  }, [])

  // Entrance animations
  const logoOpacity = useRef(new Animated.Value(0)).current
  const logoTranslate = useRef(new Animated.Value(30)).current
  const copyOpacity = useRef(new Animated.Value(0)).current
  const copyTranslate = useRef(new Animated.Value(20)).current
  const buttonOpacity = useRef(new Animated.Value(0)).current
  const buttonTranslate = useRef(new Animated.Value(40)).current
  const iconAnims = useRef(FLOATING_ICONS.map(() => new Animated.Value(0))).current

  // Breathing pulse for logo (continuous)
  const pulse = useRef(new Animated.Value(0)).current
  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] })

  // Exit animation
  const screenOpacity = useRef(new Animated.Value(1)).current
  const buttonScale = useRef(new Animated.Value(1)).current

  // Run entrance animations
  const runEntrance = useCallback(() => {
    // Logo entrance
    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(logoTranslate, {
        toValue: 0,
        duration: 600,
        easing: Easing.out(Easing.back(1.2)),
        useNativeDriver: true,
      }),
    ]).start()

    // Copy entrance (slight delay)
    Animated.parallel([
      Animated.timing(copyOpacity, {
        toValue: 1,
        duration: 500,
        delay: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(copyTranslate, {
        toValue: 0,
        duration: 500,
        delay: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start()

    // Button entrance (after copy)
    Animated.parallel([
      Animated.timing(buttonOpacity, {
        toValue: 1,
        duration: 400,
        delay: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(buttonTranslate, {
        toValue: 0,
        duration: 400,
        delay: 400,
        easing: Easing.out(Easing.back(1.1)),
        useNativeDriver: true,
      }),
    ]).start()

    // Floating icons staggered entrance
    Animated.stagger(
      60,
      iconAnims.map(anim =>
        Animated.timing(anim, {
          toValue: 1,
          duration: 400,
          easing: Easing.out(Easing.back(1.3)),
          useNativeDriver: true,
        })
      )
    ).start()

    // Start breathing pulse loop
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    )
    pulseLoop.start()

    return () => pulseLoop.stop()
  }, [logoOpacity, logoTranslate, copyOpacity, copyTranslate, buttonOpacity, buttonTranslate, iconAnims, pulse])

  // Only run entrance animations when we're done checking and showing splash
  useEffect(() => {
    if (isChecking) return // Don't animate while checking auth/terms
    const cleanup = runEntrance()
    return cleanup
  }, [runEntrance, isChecking])

  // Run exit animation and navigate
  const runExit = useCallback(async () => {
    if (isExiting) return
    setIsExiting(true)

    // Haptic feedback
    if (Platform.OS !== 'web') {
      try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium) } catch { }
    }

    // Button pop
    Animated.sequence([
      Animated.spring(buttonScale, {
        toValue: 0.95,
        stiffness: 400,
        damping: 10,
        useNativeDriver: true,
      }),
      Animated.spring(buttonScale, {
        toValue: 1,
        stiffness: 300,
        damping: 15,
        useNativeDriver: true,
      }),
    ]).start()

    // Screen fade out
    Animated.timing(screenOpacity, {
      toValue: 0,
      duration: 300,
      delay: 100,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(async () => {
      // Check if terms already accepted
      const termsAccepted = await hasAcceptedTerms()
      if (termsAccepted) {
        router.replace('/auth')
      } else {
        router.replace('/onboarding/terms')
      }
    })
  }, [isExiting, buttonScale, screenOpacity])

  const onStart = () => {
    runExit()
  }

  // Show minimal loading while checking auth/terms (prevents flash)
  if (isChecking) {
    return <View style={styles.container} />
  }

  return (
    <Animated.View style={[styles.container, { opacity: screenOpacity }]}>
      {/* Decorative floating icons with staggered fade-in */}
      <View pointerEvents="none" style={styles.iconsLayer}>
        {FLOATING_ICONS.map((icon, index) => (
          <Animated.View
            key={icon.name + index}
            style={[
              styles.badge,
              { top: icon.top, left: icon.left, right: icon.right },
              {
                opacity: iconAnims[index],
                transform: [
                  { scale: iconAnims[index].interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
                ],
              },
            ]}
          >
            <Icon name={icon.name as any} size={icon.size || 26} color={icon.color} />
          </Animated.View>
        ))}
      </View>

      {/* Center logo with entrance animation + breathing pulse */}
      <Animated.View
        style={[
          styles.centerWrap,
          {
            opacity: logoOpacity,
            transform: [
              { translateY: logoTranslate },
              { scale: pulseScale },
            ],
          },
        ]}
      >
        <View style={styles.logoWrap}>
          <SvgUri uri={logoUri} width="100%" height="100%" />
        </View>
      </Animated.View>

      {/* Title / tagline with entrance animation */}
      <Animated.View
        style={[
          styles.copy,
          {
            opacity: copyOpacity,
            transform: [{ translateY: copyTranslate }],
          },
        ]}
      >
        <Text style={styles.brand}>sentisphere</Text>
        <Text style={styles.headline}>Delightful Wellness</Text>
      </Animated.View>

      {/* CTA with entrance animation */}
      <Animated.View
        style={[
          styles.ctaWrap,
          {
            opacity: buttonOpacity,
            transform: [
              { translateY: buttonTranslate },
              { scale: buttonScale },
            ],
          },
        ]}
      >
        <Pressable
          onPress={onStart}
          disabled={isExiting}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.95 }]}
          accessibilityLabel="Get Started"
        >
          <Text style={styles.ctaText}>Get Started</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.select({ ios: 56, android: 36, default: 24 }) as number,
    paddingBottom: Platform.select({ ios: 28, android: 24, default: 24 }) as number,
  },
  iconsLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    position: 'absolute',
  },
  centerWrap: {
    marginTop: 20,
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrap: {
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    alignItems: 'center',
    marginTop: -10,
  },
  brand: {
    fontSize: 18,
    letterSpacing: 1.2,
    color: '#9CA3AF',
    textTransform: 'lowercase',
    marginBottom: 6,
    fontFamily: 'Inter_500Medium',
  },
  headline: {
    fontSize: 30,
    color: '#111827',
    fontFamily: 'Inter_700Bold',
  },
  ctaWrap: {
    width: '100%',
    paddingHorizontal: 20,
  },
  cta: {
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
  ctaText: {
    color: 'white',
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
  },
})

