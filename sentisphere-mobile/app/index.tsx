import React, { useRef, useEffect } from 'react'
import { View, Text, StyleSheet, Pressable, Animated, Easing, Platform, Image as RNImage } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { Colors } from '@/constants/theme'
import { Icon } from '@/components/ui/icon'
import * as Haptics from 'expo-haptics'
import { SvgUri } from 'react-native-svg'

export default function SplashIntro() {
  const palette = Colors.light as any
  const logoSource: any = require('@/assets/images/logo.svg')
  const logoUri = RNImage.resolveAssetSource(logoSource)?.uri

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
    router.replace('/(student)/(tabs)/dashboard')
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#F7FAFF', '#FFF5F7', '#F0FFF4']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Decorative orbit icons */}
      <View pointerEvents="none" style={styles.iconsLayer}>
        <View style={[styles.badge, { top: 80, left: 28 }]}>
          <Icon name="calendar" size={18} color="#7C3AED" />
        </View>
        <View style={[styles.badge, { top: 130, right: 28 }]}>
          <Icon name="map-pin" size={18} color="#F97316" />
        </View>
        <View style={[styles.badge, { top: 220, left: 36 }]}>
          <Icon name="ticket" size={18} color="#2563EB" />
        </View>
        <View style={[styles.badge, { top: 270, right: 40 }]}>
          <Icon name="party-popper" size={18} color="#EC4899" />
        </View>
        <View style={[styles.badge, { top: 360, left: 70 }]}>
          <Icon name="globe-2" size={18} color="#10B981" />
        </View>
        <View style={[styles.badge, { top: 380, right: 70 }]}>
          <Icon name="smile" size={18} color="#A855F7" />
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
        <LinearGradient colors={[palette.tint, '#F59E0B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.gradientTextMask}>
          <Text style={styles.subheadline}>Start Here</Text>
        </LinearGradient>
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
    marginTop: 36,
    width: 240,
    height: 240,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrap: {
    width: 200,
    height: 200,
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
    fontSize: 14,
    letterSpacing: 1.2,
    color: '#9CA3AF',
    textTransform: 'lowercase',
    marginBottom: 6,
    fontFamily: 'Inter_500Medium',
  },
  headline: {
    fontSize: 28,
    color: '#111827',
    fontFamily: 'Inter_700Bold',
  },
  gradientTextMask: {
    borderRadius: 6,
    paddingHorizontal: 2,
    marginTop: 6,
  },
  subheadline: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    color: 'white',
    // gradient text effect hack: use gradient background and set text color to transparent on web; on native keep high-contrast white
    ...(Platform.OS === 'web' ? { color: 'transparent', backgroundClip: 'text' as any, WebkitBackgroundClip: 'text' as any } : {}),
  },
  ctaWrap: {
    width: '100%',
    paddingHorizontal: 20,
  },
  cta: {
    height: 56,
    borderRadius: 16,
    backgroundColor: '#111827',
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
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
})
