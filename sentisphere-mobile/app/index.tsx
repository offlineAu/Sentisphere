import React, { useRef, useEffect } from 'react'
import { View, Text, StyleSheet, Pressable, Animated, Easing, Platform } from 'react-native'
import { Asset } from 'expo-asset'
import { router } from 'expo-router'
import { Colors } from '@/constants/theme'
import { Icon } from '@/components/ui/icon'
import * as Haptics from 'expo-haptics'
import { SvgUri } from 'react-native-svg'

export default function SplashIntro() {
  const palette = Colors.light as any
  const logoSource: any = require('@/assets/images/logo.svg')
  const logoUri = Asset.fromModule(logoSource).uri

  // subtle pulse for center glyph
  const pulse = useRef(new Animated.Value(0)).current
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] })
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.08, 0.16] })

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [pulse])

  const onStart = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium) } catch {}
    router.replace('/auth')
  }

  return (
    <View style={styles.container}>
      {/* White background retained via styles.container */}

      {/* Decorative orbit icons */}
      <View pointerEvents="none" style={styles.iconsLayer}>
        <View style={[styles.badge, { top: 80, left: 28 }]}>
          <Icon name="calendar" size={26} color="#7C3AED" />
        </View>
        <View style={[styles.badge, { top: 130, right: 28 }]}>
          <Icon name="map-pin" size={26} color="#F97316" />
        </View>
        <View style={[styles.badge, { top: 220, left: 36 }]}>
          <Icon name="ticket" size={26} color="#2563EB" />
        </View>
        <View style={[styles.badge, { top: 270, right: 40 }]}>
          <Icon name="party-popper" size={26} color="#EC4899" />
        </View>
        <View style={[styles.badge, { top: 360, left: 70 }]}>
          <Icon name="globe-2" size={26} color="#10B981" />
        </View>
        <View style={[styles.badge, { top: 380, right: 70 }]}>
          <Icon name="smile" size={26} color="#A855F7" />
        </View>
        <View style={[styles.badge, { top: 160, left: 120 }]}>
          <Icon name="book-open" size={24} color="#0EA5E9" />
        </View>
        <View style={[styles.badge, { top: 320, right: 120 }]}>
          <Icon name="heart" size={24} color="#EF4444" />
        </View>
        <View style={[styles.badge, { top: 440, left: 30 }]}>
          <Icon name="sparkles" size={24} color="#F59E0B" />
        </View>
        <View style={[styles.badge, { top: 480, right: 40 }]}>
          <Icon name="bell" size={24} color="#22C55E" />
        </View>
      </View>

      {/* Center logo with subtle pulse */}
      <Animated.View style={[styles.centerWrap, { transform: [{ scale }] }]}>        
        {/* logo only (no tile or ring) */}
        <View style={styles.logoWrap}>
          <SvgUri uri={logoUri} width="100%" height="100%" />
        </View>
      </Animated.View>

      {/* Title / tagline */}
      <View style={styles.copy}>
        <Text style={styles.brand}>sentisphere</Text>
        <Text style={styles.headline}>Delightful Wellness</Text>
      </View>

      {/* CTA */}
      <View style={styles.ctaWrap}>
        <Pressable onPress={onStart} style={({ pressed }) => [styles.cta, pressed && { opacity: 0.95 }]} accessibilityLabel="Get Started">
          <Text style={styles.ctaText}>Get Started</Text>
        </Pressable>
      </View>
    </View>
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
  beamTL: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
  },
  beamBR: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
  },
  centerRing: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
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
  gradientTextMask: {},
  subheadline: {},
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
