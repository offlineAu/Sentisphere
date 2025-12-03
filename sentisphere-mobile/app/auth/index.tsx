import { useEffect, useState, useRef } from 'react'
import { View, TextInput, StyleSheet, ScrollView, Platform, Animated, Easing, Pressable, LayoutChangeEvent, Image, Keyboard } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { ThemedView } from '@/components/themed-view'
import { ThemedText } from '@/components/themed-text'
import { GlobalScreenWrapper } from '@/components/GlobalScreenWrapper'
import { Button } from '@/components/ui/button'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { Colors } from '@/constants/theme'
import { router } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import { LoadingSplash } from '@/components/ui/loading-splash'
import { KeyboardAwareScrollView, KeyboardAwareScrollViewRef } from '@/components/KeyboardAwareScrollView'

export default function AuthScreen() {
  const scheme = useColorScheme() ?? 'light'
  const palette = Colors[scheme] as any
  const API = process.env.EXPO_PUBLIC_API_URL || 'https://sentisphere-production.up.railway.app'

  const [mode, setMode] = useState<'signup' | 'login'>('signup')
  const [nickname, setNickname] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [student, setStudent] = useState<any>(null)
  const [token, setToken] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [attempting, setAttempting] = useState(false)
  const [successNickname, setSuccessNickname] = useState<string | null>(null)
  const [welcomeVisible, setWelcomeVisible] = useState(false)
  const [showSplash, setShowSplash] = useState(false)
  const [splashPhase, setSplashPhase] = useState<'loading' | 'success'>('loading')
  const toastOpacity = useRef(new Animated.Value(0)).current
  const toastTranslateY = useRef(new Animated.Value(-50)).current
  const segmentAnim = useRef(new Animated.Value(0)).current
  const formAnim = useRef(new Animated.Value(1)).current
  const [segmentWidth, setSegmentWidth] = useState(0)
  const successAnim = useRef(new Animated.Value(0)).current
  const welcomeAnim = useRef(new Animated.Value(0)).current
  const [oopsVisible, setOopsVisible] = useState(false)
  const oopsAnim = useRef(new Animated.Value(0)).current
  const scrollViewRef = useRef<KeyboardAwareScrollViewRef>(null)
  const nicknameInputRef = useRef<TextInput>(null)
  

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
    // Indicator subtle bounce (iOS-safe: transform only)
    segmentAnim.stopAnimation()
    Animated.spring(segmentAnim, {
      toValue: mode === 'signup' ? 0 : 1,
      stiffness: 220,
      damping: 22,
      mass: 0.9,
      overshootClamping: false,
      useNativeDriver: true,
    }).start()

    // Form subtle fade/slide
    formAnim.stopAnimation()
    formAnim.setValue(0)
    Animated.timing(formAnim, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start()
  }, [mode])

  useEffect(() => {
    if (successNickname) {
      successAnim.setValue(0)
      Animated.timing(successAnim, { toValue: 1, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
    }
  }, [successNickname])

  useEffect(() => {
    if (welcomeVisible) {
      welcomeAnim.setValue(0)
      Animated.timing(welcomeAnim, { toValue: 1, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
    }
  }, [welcomeVisible])

  useEffect(() => {
    if (oopsVisible) {
      oopsAnim.setValue(0)
      Animated.timing(oopsAnim, { toValue: 1, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
    }
  }, [oopsVisible])

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
      // Dismiss keyboard immediately when starting registration
      Keyboard.dismiss()
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
      // Dismiss keyboard immediately when starting login
      Keyboard.dismiss()
      setAttempting(true)
      setStatus('Signing in...')
      const d = await post('/api/auth/mobile/login', { nickname })
      const tok = d.access_token || d.token || null
      setToken(tok)
      if (tok) { await saveToken(tok) }
      setStatus('Signed in')
      setWelcomeVisible(true)
    } catch (e: any) {
      setStatus(null)
      const msg = (e?.message || '').toString()
      const notRegistered = /not\s*registered/i.test(msg) || /user\s*not\s*found/i.test(msg) || /\/api\/auth\/mobile\/login\s+failed:\s+(404|401)/i.test(msg)
      if (notRegistered) {
        setOopsVisible(true)
      } else {
        showToast(msg || 'Login failed')
      }
    } finally {
      setAttempting(false)
    }
  }

  // Smooth scroll to input when focused - uses KeyboardAwareScrollView's built-in method
  const smoothScrollToInput = (inputY: number) => {
    scrollViewRef.current?.scrollInputIntoView(inputY)
  }

  return (
    <GlobalScreenWrapper backgroundColor="#FFFFFF" topPadding={0}>
      <KeyboardAwareScrollView 
        ref={scrollViewRef}
        backgroundColor="#FFFFFF"
        contentContainerStyle={styles.screen}
      >
        <View style={styles.stack}>
          <View style={{ alignItems: 'center' }}>
            <Image source={require('../../assets/images/sentisphere-logo.png')} style={{ width: 200, height: 200, marginBottom: -20 }} accessibilityLabel="Login" />
          </View>
          <ThemedText type="title" style={[styles.title, { fontSize: 30 }]}>Welcome Student</ThemedText>

          <View
            style={styles.segmentContainer}
            onLayout={(event: LayoutChangeEvent) => {
              const w = event.nativeEvent.layout.width
              setSegmentWidth(w)
              // Ensure indicator is positioned correctly immediately on first layout
              segmentAnim.setValue(mode === 'signup' ? 0 : 1)
            }}
          >
            {segmentWidth > 0 ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.segmentIndicator,
                  {
                    width: Math.max(Math.round((segmentWidth - 8) / 2), 0),
                    transform: [{
                      translateX: segmentAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [4, 4 + Math.max((segmentWidth - 8) / 2, 0)],
                      }) as any,
                    }],
                  },
                ]}
              >
                <LinearGradient
                  colors={['#0d8c4f', '#11a45b']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFillObject as any}
                />
              </Animated.View>
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
              ref={nicknameInputRef}
              placeholder="e.g. Jun"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
              autoCorrect={false}
              value={nickname}
              onChangeText={setNickname}
              blurOnSubmit={false}
              returnKeyType="done"
              onSubmitEditing={() => {}}
              onFocus={() => {
                // Smooth scroll input into view when focused
                smoothScrollToInput(280)
              }}
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
      </KeyboardAwareScrollView>
      
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

      {Boolean(successNickname) && (
        <View style={styles.successOverlay}>
          <LinearGradient colors={["#FFFFFF", "#ECFDF5"]} style={StyleSheet.absoluteFillObject} />
          <Animated.View style={{ alignItems: 'center', gap: 8, opacity: successAnim, transform: [{ scale: successAnim.interpolate({ inputRange: [0,1], outputRange: [0.96, 1] }) }] }}>
            <Image source={require('../../assets/images/congrats.png')} style={{ width: 120, height: 120 }} accessibilityLabel="Success" />
            <ThemedText style={{ fontSize: 20, fontFamily: 'Inter_700Bold', color: '#111827', marginTop: 6 }}>
              Welcome {successNickname}!
            </ThemedText>
            <ThemedText style={{ fontSize: 13, color: '#6B7280', textAlign: 'center', marginHorizontal: 24 }}>
              You're all set. Tap continue to explore your dashboard.
            </ThemedText>
          </Animated.View>
          <View style={styles.successBottom}>
            <Button
              title="Continue"
              onPress={() => { setSuccessNickname(null); router.replace('/(student)/(tabs)/dashboard') }}
              style={{ paddingVertical: 14, borderRadius: 999, alignSelf: 'stretch' }}
              textStyle={{ fontSize: 14 }}
            />
          </View>
        </View>
      )}

      {welcomeVisible && (
        <View style={styles.successOverlay}>
          <LinearGradient colors={["#FFFFFF", "#ECFDF5"]} style={StyleSheet.absoluteFillObject} />
          <Animated.View style={{ alignItems: 'center', gap: 8, opacity: welcomeAnim, transform: [{ scale: welcomeAnim.interpolate({ inputRange: [0,1], outputRange: [0.96, 1] }) }] }}>
            <Image source={require('../../assets/images/welcome-back.png')} style={{ width: 120, height: 120 }} accessibilityLabel="Welcome back" />
            <ThemedText style={{ fontSize: 20, fontFamily: 'Inter_700Bold', color: '#111827', marginTop: 6 }}>
              Welcome back to Sentisphere!
            </ThemedText>
            <ThemedText style={{ fontSize: 13, color: '#6B7280', textAlign: 'center', marginHorizontal: 24 }}>
              Glad to see you again.
            </ThemedText>
          </Animated.View>
          <View style={styles.successBottom}>
            <Button
              title="Continue"
              onPress={() => { setWelcomeVisible(false); router.replace('/(student)/(tabs)/dashboard') }}
              style={{ paddingVertical: 14, borderRadius: 999, alignSelf: 'stretch' }}
              textStyle={{ fontSize: 14 }}
            />
          </View>
        </View>
      )}

      {oopsVisible && (
        <View style={styles.successOverlay}>
          <LinearGradient colors={["#FFFFFF", "#ECFDF5"]} style={StyleSheet.absoluteFillObject} />
          <Animated.View style={{ alignItems: 'center', gap: 8, opacity: oopsAnim, transform: [{ scale: oopsAnim.interpolate({ inputRange: [0,1], outputRange: [0.96, 1] }) }] }}>
            <Image source={require('../../assets/images/oops.png')} style={{ width: 120, height: 120 }} accessibilityLabel="Not registered" />
            <ThemedText style={{ fontSize: 20, fontFamily: 'Inter_700Bold', color: '#111827', marginTop: 6, textAlign: 'center', marginHorizontal: 24 }}>
              Oops! You're not a registered sentisphere user
            </ThemedText>
            <ThemedText style={{ fontSize: 13, color: '#6B7280', textAlign: 'center', marginHorizontal: 24 }}>
              Please contact your school administrator or sign up to get started.
            </ThemedText>
          </Animated.View>
          <View style={styles.successBottom}>
            <Button
              title="Back to Login"
              onPress={() => { setOopsVisible(false); setMode('login') }}
              style={{ paddingVertical: 14, borderRadius: 999, alignSelf: 'stretch' }}
              textStyle={{ fontSize: 14 }}
            />
          </View>
        </View>
      )}

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
    </GlobalScreenWrapper>
  )
}

const styles = StyleSheet.create({
  whiteScreen: { flex: 1, backgroundColor: '#FFFFFF' },
  screen: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  stack: { width: '92%', maxWidth: 540 },
  title: { marginBottom: 18, textAlign: 'center', alignSelf: 'center' },
  successOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 9999,
    elevation: 6,
  },
  successBottom: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
  },
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
    borderRadius: 16,
    overflow: 'hidden',
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
