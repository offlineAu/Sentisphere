import { useEffect, useState, useRef } from 'react'
import { View, TextInput, StyleSheet, ScrollView, Platform, Animated, Easing, Pressable, LayoutChangeEvent } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { ThemedView } from '@/components/themed-view'
import { ThemedText } from '@/components/themed-text'
import { Button } from '@/components/ui/button'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { Colors } from '@/constants/theme'
import { router } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import { SuccessDialog } from '@/components/ui/success-dialog'
import { LoadingSplash } from '@/components/ui/loading-splash'

export default function AuthScreen() {
  const scheme = useColorScheme() ?? 'light'
  const palette = Colors[scheme] as any
  const API = process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:8010'

  const [mode, setMode] = useState<'signup' | 'login'>('signup')
  const [nickname, setNickname] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [student, setStudent] = useState<any>(null)
  const [token, setToken] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [attempting, setAttempting] = useState(false)
  const [successNickname, setSuccessNickname] = useState<string | null>(null)
  const [showSplash, setShowSplash] = useState(false)
  const [splashPhase, setSplashPhase] = useState<'loading' | 'success'>('loading')
  const toastOpacity = useRef(new Animated.Value(0)).current
  const toastTranslateY = useRef(new Animated.Value(-50)).current
  const segmentAnim = useRef(new Animated.Value(0)).current
  const formAnim = useRef(new Animated.Value(1)).current
  const [segmentWidth, setSegmentWidth] = useState(0)
  const AnimatedGradient = Animated.createAnimatedComponent(LinearGradient)
  

  const post = async (path: string, body: any) => {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      let detail = ''
      try {
        const payload = await res.json()
        detail = payload?.detail || payload?.message || ''
      } catch {}
      const errorText = detail ? `${detail}` : `${path} failed: ${res.status}`
      throw new Error(errorText)
    }
    return res.json()
  }

  useEffect(() => {
    // no-op for simplified email verification flow
  }, [])

  useEffect(() => {
    Animated.spring(segmentAnim, {
      toValue: mode === 'signup' ? 0 : 1,
      damping: 12,
      stiffness: 180,
      mass: 0.6,
      useNativeDriver: true,
    }).start()

    Animated.sequence([
      Animated.timing(formAnim, {
        toValue: 0,
        duration: 120,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(formAnim, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start()
  }, [mode])

  const saveToken = async (t: string) => {
    try {
      await SecureStore.setItemAsync('auth_token', t)
    } catch {}
    // Also persist for web
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.localStorage?.setItem('auth_token', t)
      }
    } catch {}
  }

  const showToast = (message: string) => {
    setToastMessage(message)
    Animated.parallel([
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(toastTranslateY, {
        toValue: 0,
        duration: 300,
        easing: Easing.out(Easing.back(1.2)),
        useNativeDriver: true,
      }),
    ]).start()

    setTimeout(() => {
      Animated.parallel([
        Animated.timing(toastOpacity, {
          toValue: 0,
          duration: 250,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(toastTranslateY, {
          toValue: -50,
          duration: 250,
          easing: Easing.in(Easing.back(1.2)),
          useNativeDriver: true,
        }),
      ]).start(() => {
        setToastMessage(null)
      })
    }, 2500)
  }

  const doRegister = async () => {
    try {
      if (!nickname || nickname.trim().length < 3) {
        showToast('Please enter a nickname (min 3 characters)')
        return
      }
      setAttempting(true)
      setStatus('Registering...')
      setSplashPhase('loading')
      setShowSplash(true)
      const d = await post('/api/auth/mobile/register', { nickname })
      setToken(d.access_token)
      await saveToken(d.access_token)
      setStatus('Registered and signed in')
      setSuccessNickname(nickname.trim())
      setSplashPhase('success')
    } catch (e: any) {
      setStatus(null)
      showToast(e?.message || 'Registration failed')
      setShowSplash(false)
    } finally {
      setAttempting(false)
    }
  }

  const doLogin = async () => {
    try {
      if (!nickname || nickname.trim().length < 3) {
        showToast('Please enter your nickname')
        return
      }
      setAttempting(true)
      setStatus('Signing in...')
      const d = await post('/api/auth/mobile/login', { nickname })
      const tok = d.access_token || d.token || null
      setToken(tok)
      if (tok) { await saveToken(tok) }
      setStatus('Signed in')
      router.replace('/(student)/(tabs)/dashboard')
    } catch (e: any) {
      setStatus(null)
      showToast(e?.message || 'Login failed')
    } finally {
      setAttempting(false)
    }
  }

  return (
    <ThemedView style={styles.whiteScreen}>
      <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
        <View style={styles.stack}>
          <ThemedText type="title" style={[styles.title, { fontSize: 40 }]}>Welcome Student</ThemedText>

          <View
            style={styles.segmentContainer}
            onLayout={(event: LayoutChangeEvent) => {
              setSegmentWidth(event.nativeEvent.layout.width)
            }}
          >
            {segmentWidth > 0 ? (
              <AnimatedGradient
                colors={['#0d8c4f', '#11a45b']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                pointerEvents="none"
                style={[
                  styles.segmentIndicator,
                  {
                    width: Math.max((segmentWidth - 8) / 2, 0),
                    left: segmentAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [4, 4 + Math.max((segmentWidth - 8) / 2, 0)],
                    }),
                  },
                ]}
              />
            ) : null}
            <Pressable style={styles.segmentButton} onPress={() => setMode('signup')}>
              <ThemedText style={[styles.segmentLabel, mode === 'signup' && styles.segmentLabelActive]}>Sign Up</ThemedText>
            </Pressable>
            <Pressable style={styles.segmentButton} onPress={() => setMode('login')}>
              <ThemedText style={[styles.segmentLabel, mode === 'login' && styles.segmentLabelActive]}>Login</ThemedText>
            </Pressable>
          </View>

          <Animated.View
            style={{
              opacity: formAnim,
              transform: [
                {
                  translateY: formAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [10, 0],
                  }),
                },
              ],
            }}
          >
          <View style={styles.field}>
            <ThemedText style={styles.label}>Nickname</ThemedText>
            <TextInput
              placeholder="e.g. Jun"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
              value={nickname}
              onChangeText={setNickname}
              style={[styles.input, { borderColor: palette.border, color: palette.text }]} />
          </View>
          <View style={styles.colButtons}>
            <Button
              title={mode === 'signup' ? 'Sign Up' : 'Log In'}
              onPress={mode === 'signup' ? doRegister : doLogin}
              variant="primary"
              style={styles.buttonSmall}
              textStyle={{ fontSize: 16 }}
              loading={attempting}
              disabled={attempting}
            />
          </View>
          {status ? (
            <ThemedText style={{ marginTop: 12, textAlign: 'center', color: status.startsWith('✅') || status.includes('Signed') ? '#16A34A' : '#DC2626' }}>{status}</ThemedText>
          ) : null}
          </Animated.View>
        </View>
      </ScrollView>
      
      {/* Animated Toast */}
      {toastMessage && (
        <Animated.View
          style={[
            styles.toast,
            {
              opacity: toastOpacity,
              transform: [{ translateY: toastTranslateY }],
            },
          ]}
        >
          <ThemedText style={styles.toastText}>{toastMessage}</ThemedText>
        </Animated.View>
      )}

      <SuccessDialog
        visible={Boolean(successNickname)}
        title={`🎉 Welcome to Sentisphere, ${successNickname || ''}!`}
        message={
          <ThemedText style={{ textAlign: 'center', color: '#4B5563' }}>
            You're all set. Tap continue to explore your dashboard.
          </ThemedText>
        }
        onContinue={() => {
          setSuccessNickname(null)
          router.replace('/(student)/(tabs)/dashboard')
        }}
        onRequestClose={() => {
          setSuccessNickname(null)
        }}
      />

      <LoadingSplash
        visible={showSplash}
        nickname={nickname.trim() || undefined}
        phase={splashPhase}
        onFinished={() => {
          if (splashPhase === 'success') {
            setShowSplash(false)
            // allow the success dialog to appear already visible
          }
        }}
      />
    </ThemedView>
  )
}

const styles = StyleSheet.create({
  whiteScreen: { flex: 1, backgroundColor: '#FFFFFF' },
  screen: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  stack: { width: '92%', maxWidth: 540 },
  title: { marginBottom: 18, textAlign: 'center', alignSelf: 'center' },
  field: { gap: 6, marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ ios: 12, default: 10 }) as number,
  },
  colButtons: { marginTop: 16, alignItems: 'stretch' },
  buttonSmall: { paddingVertical: 14, alignSelf: 'stretch' },
  label: { fontSize: 14, fontFamily: 'Inter_500Medium', color: '#6B7280' },
  segmentContainer: {
    flexDirection: 'row',
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 4,
    paddingVertical: 4,
    marginBottom: 18,
    position: 'relative',
    overflow: 'hidden',
  },
  segmentIndicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    borderRadius: 12,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  segmentLabel: {
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
    color: '#6B7280',
  },
  segmentLabelActive: {
    color: '#FFFFFF',
  },
  toast: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    backgroundColor: '#DC2626',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
    zIndex: 1000,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    textAlign: 'center',
  },
})
