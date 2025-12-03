import { useEffect } from 'react'
import { StyleSheet, View, Image } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  runOnJS,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { ThemedText } from '@/components/themed-text'

export type LoadingSplashProps = {
  visible: boolean
  nickname?: string | null
  statusText?: string
  phase?: 'loading' | 'success'
  onFinished?: () => void
}

const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient)

export function LoadingSplash({ visible, nickname, statusText = 'Creating your account…', phase = 'loading', onFinished }: LoadingSplashProps) {
  const backdropOpacity = useSharedValue(0)
  const logoScale = useSharedValue(0.85)
  const glowOpacity = useSharedValue(0)
  const textOpacity = useSharedValue(0)
  const textTranslate = useSharedValue(12)

  useEffect(() => {
    if (visible) {
      backdropOpacity.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) })
      logoScale.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.back(1.3)) })
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.55, { duration: 600, easing: Easing.inOut(Easing.quad) }),
          withTiming(0.15, { duration: 600, easing: Easing.inOut(Easing.quad) })
        ),
        -1,
        true
      )
      textOpacity.value = withDelay(180, withTiming(1, { duration: 360, easing: Easing.out(Easing.quad) }))
      textTranslate.value = withDelay(180, withTiming(0, { duration: 360, easing: Easing.out(Easing.quad) }))
    } else {
      backdropOpacity.value = withTiming(0, { duration: 250, easing: Easing.in(Easing.quad) })
      glowOpacity.value = withTiming(0, { duration: 180, easing: Easing.in(Easing.quad) })
      textOpacity.value = withTiming(0, { duration: 180, easing: Easing.in(Easing.quad) })
      textTranslate.value = withTiming(12, { duration: 200, easing: Easing.in(Easing.quad) })
    }
  }, [visible, backdropOpacity, glowOpacity, logoScale, textOpacity, textTranslate])

  useEffect(() => {
    if (!visible || phase !== 'success') return

    glowOpacity.value = withSequence(
      withTiming(0.95, { duration: 240, easing: Easing.out(Easing.quad) }),
      withTiming(0.2, { duration: 220, easing: Easing.in(Easing.quad) })
    )
    logoScale.value = withSequence(
      withTiming(1.1, { duration: 260, easing: Easing.out(Easing.back(1.6)) }),
      withTiming(0.97, { duration: 180, easing: Easing.inOut(Easing.quad) }),
      withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) }, (finished) => {
        if (finished && onFinished) {
          runOnJS(onFinished)()
        }
      })
    )
  }, [phase, visible, glowOpacity, logoScale, onFinished])

  const containerStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }))

  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value }],
  }))

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }))

  const messageStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
    transform: [{ translateY: textTranslate.value }],
  }))

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.container, containerStyle]} pointerEvents={visible ? 'auto' : 'none'}>
      <AnimatedGradient
        colors={['#FFFFFF', '#F0FDF4']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.logoWrapper}>
        <Animated.View style={[styles.glow, glowStyle]} />
        <Animated.View style={[styles.logoBadge, logoStyle]}>
          <Image source={require('@/assets/images/Sentisphere Logo Only.png')} style={styles.logo} />
        </Animated.View>
        <Animated.View style={[styles.messageBlock, messageStyle]}>
          <ThemedText type="subtitle" style={styles.status}>{statusText}</ThemedText>
          {nickname ? (
            <ThemedText style={styles.subtext}>{`Hi ${nickname}, we’re setting things up…`}</ThemedText>
          ) : null}
        </Animated.View>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  logoWrapper: {
    width: '70%',
    maxWidth: 320,
    alignItems: 'center',
    gap: 20,
  },
  logoBadge: {
    width: 140,
    height: 140,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#047857',
    shadowOpacity: 0.24,
    shadowRadius: 25,
    shadowOffset: { width: 0, height: 12 },
    elevation: 18,
  },
  glow: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(13, 140, 79, 0.18)',
  },
  logo: {
    width: 100,
    height: 100,
    resizeMode: 'contain',
  },
  messageBlock: {
    alignItems: 'center',
    gap: 8,
  },
  status: {
    color: '#0d8c4f',
    fontSize: 18,
    fontWeight: '600',
  },
  subtext: {
    color: '#6b7280',
    fontSize: 14,
    textAlign: 'center',
  },
})
