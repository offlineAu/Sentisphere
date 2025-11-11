import { ReactNode, useEffect, useRef } from 'react'
import { Modal, Pressable, StyleSheet, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { ThemedText } from '@/components/themed-text'
import { Button } from '@/components/ui/button'

export type SuccessDialogProps = {
  visible: boolean
  title: string
  message?: ReactNode
  onContinue?: () => void
  onRequestClose?: () => void
}

export function SuccessDialog({ visible, title, message, onContinue, onRequestClose }: SuccessDialogProps) {
  const opacity = useSharedValue(0)
  const scale = useSharedValue(0.85)

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) })
      scale.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.back(1.2)) })
    } else {
      opacity.value = withTiming(0, { duration: 180, easing: Easing.in(Easing.quad) })
      scale.value = withTiming(0.85, { duration: 200, easing: Easing.in(Easing.quad) })
    }
  }, [visible, opacity, scale])

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }))

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onRequestClose}
    >
      <Animated.View style={[styles.backdrop, containerStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onRequestClose} />
        <Animated.View style={[styles.card, cardStyle]}>
          <ThemedText type="title" style={styles.title}>{title}</ThemedText>
          {typeof message === 'string' ? (
            <ThemedText style={styles.message}>{message}</ThemedText>
          ) : message}
          <Button title="Continue" onPress={onContinue} style={styles.button} variant="primary" />
        </Animated.View>
      </Animated.View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 24,
    shadowColor: '#0f172a',
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
    gap: 12,
  },
  title: {
    textAlign: 'center',
    fontSize: 24,
    marginBottom: 8,
  },
  message: {
    textAlign: 'center',
    color: '#4B5563',
    fontSize: 16,
  },
  button: {
    marginTop: 16,
    alignSelf: 'center',
    minWidth: 160,
  },
})
