import { useEffect, useRef, useState, useCallback } from 'react';
import { 
  Animated, 
  StyleSheet, 
  Platform, 
  Keyboard, 
  View,
  KeyboardEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { Easing } from 'react-native';

export type ToastType = 'success' | 'error' | 'info';

interface BottomToastProps {
  visible: boolean;
  message: string;
  type?: ToastType;
  duration?: number;
  onHide?: () => void;
}

const TOAST_ICONS = {
  success: { name: 'check-circle' as const, color: '#10B981' },
  error: { name: 'alert-circle' as const, color: '#EF4444' },
  info: { name: 'info' as const, color: '#3B82F6' },
};

export function BottomToast({ 
  visible, 
  message, 
  type = 'success',
  duration = 1500,
  onHide,
}: BottomToastProps) {
  const insets = useSafeAreaInsets();
  const [toastBottomOffset, setToastBottomOffset] = useState(Math.max(insets.bottom, 20) + 24);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  // Keyboard listeners for toast positioning
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showListener = Keyboard.addListener(showEvent, (e: KeyboardEvent) => {
      setToastBottomOffset(e.endCoordinates.height + 20);
    });
    const hideListener = Keyboard.addListener(hideEvent, () => {
      setToastBottomOffset(Math.max(insets.bottom, 20) + 24);
    });

    return () => {
      showListener.remove();
      hideListener.remove();
    };
  }, [insets.bottom]);

  // Animation when visibility changes
  useEffect(() => {
    if (visible) {
      // Reset values
      translateY.setValue(20);
      opacity.setValue(0);
      
      // Animate in
      Animated.parallel([
        Animated.timing(opacity, { 
          toValue: 1, 
          duration: 180, 
          useNativeDriver: true 
        }),
        Animated.timing(translateY, { 
          toValue: 0, 
          duration: 180, 
          easing: Easing.out(Easing.cubic), 
          useNativeDriver: true 
        }),
      ]).start(() => {
        // Auto-hide after duration
        setTimeout(() => {
          Animated.parallel([
            Animated.timing(opacity, { 
              toValue: 0, 
              duration: 250, 
              useNativeDriver: true 
            }),
            Animated.timing(translateY, { 
              toValue: 10, 
              duration: 250, 
              useNativeDriver: true 
            }),
          ]).start(() => {
            onHide?.();
          });
        }, duration);
      });
    }
  }, [visible, duration, onHide]);

  if (!visible) return null;

  const iconConfig = TOAST_ICONS[type];

  return (
    <Animated.View 
      style={[
        styles.container, 
        { 
          bottom: toastBottomOffset,
          opacity,
          transform: [{ translateY }],
        }
      ]}
      pointerEvents="none"
    >
      <Icon name={iconConfig.name} size={16} color="#FFFFFF" />
      <ThemedText style={styles.text}>{message}</ThemedText>
    </Animated.View>
  );
}

// Hook for easier toast management
export function useBottomToast() {
  const [toastState, setToastState] = useState<{
    visible: boolean;
    message: string;
    type: ToastType;
  }>({
    visible: false,
    message: '',
    type: 'success',
  });

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    setToastState({ visible: true, message, type });
  }, []);

  const hideToast = useCallback(() => {
    setToastState(prev => ({ ...prev, visible: false }));
  }, []);

  return {
    toastState,
    showToast,
    hideToast,
    ToastComponent: (
      <BottomToast
        visible={toastState.visible}
        message={toastState.message}
        type={toastState.type}
        onHide={hideToast}
      />
    ),
  };
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    marginHorizontal: 40,
    zIndex: 1000,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Platform.select({
      ios: 'rgba(0, 0, 0, 0.85)',
      android: 'rgba(50, 50, 50, 0.95)',
      default: 'rgba(0, 0, 0, 0.88)',
    }),
    paddingVertical: Platform.select({ ios: 12, android: 14, default: 12 }),
    paddingHorizontal: 20,
    borderRadius: Platform.select({ ios: 12, android: 8, default: 12 }),
    // Shadow for iOS
    ...(Platform.OS === 'ios' && {
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
    }),
    // Elevation for Android
    ...(Platform.OS === 'android' && {
      elevation: 6,
    }),
  },
  text: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
});
