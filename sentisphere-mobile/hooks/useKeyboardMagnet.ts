import { useRef, useCallback, useEffect } from 'react';
import { Animated, Keyboard, Platform, ScrollView, TextInput, Easing, LayoutAnimation, UIManager } from 'react-native';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface UseKeyboardMagnetOptions {
  /** Extra offset from the top of keyboard (default: 120) */
  extraOffset?: number;
  /** Animation duration in ms (default: 280) */
  animationDuration?: number;
  /** Whether to use smooth spring animation (default: true) */
  useSpring?: boolean;
}

/**
 * Hook for smooth keyboard-aware input scrolling.
 * Returns a scroll ref and focus handler to attach to inputs.
 */
export function useKeyboardMagnet(options: UseKeyboardMagnetOptions = {}) {
  const {
    extraOffset = 120,
    animationDuration = 280,
    useSpring = true,
  } = options;

  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const inputRefs = useRef<Map<string, TextInput>>(new Map());
  const focusedInputY = useRef<number>(0);
  const keyboardHeight = useRef<number>(0);

  // Track keyboard show/hide
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        keyboardHeight.current = e.endCoordinates.height;
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        keyboardHeight.current = 0;
      }
    );

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  /**
   * Register an input ref for measurement
   */
  const registerInput = useCallback((key: string, ref: TextInput | null) => {
    if (ref) {
      inputRefs.current.set(key, ref);
    } else {
      inputRefs.current.delete(key);
    }
  }, []);

  /**
   * Smooth scroll to make the input visible above keyboard
   */
  const scrollToInput = useCallback((
    inputY: number,
    inputHeight: number = 50,
    delay: number = 100
  ) => {
    // Wait for keyboard to start appearing
    setTimeout(() => {
      const targetY = Math.max(0, inputY - extraOffset);
      
      if (useSpring) {
        // Use LayoutAnimation for smooth native feel
        LayoutAnimation.configureNext({
          duration: animationDuration,
          update: {
            type: LayoutAnimation.Types.easeInEaseOut,
            property: LayoutAnimation.Properties.scaleY,
          },
        });
      }

      scrollRef.current?.scrollTo({
        y: targetY,
        animated: true,
      });
    }, delay);
  }, [extraOffset, animationDuration, useSpring]);

  /**
   * Create an onFocus handler for a specific input
   * @param yOffset - The Y position of the input in the scroll content
   * @param inputHeight - Height of the input (optional, default 50)
   */
  const createFocusHandler = useCallback((
    yOffset: number,
    inputHeight: number = 50
  ) => {
    return () => {
      focusedInputY.current = yOffset;
      scrollToInput(yOffset, inputHeight);
    };
  }, [scrollToInput]);

  /**
   * Measure and scroll to input using its ref
   */
  const scrollToInputRef = useCallback((inputRef: TextInput | null) => {
    if (!inputRef || !scrollRef.current) return;

    // Use measureLayout for accurate positioning
    const scrollNode = scrollRef.current as any;
    if (scrollNode.getScrollableNode) {
      inputRef.measureLayout(
        scrollNode.getScrollableNode(),
        (x, y, width, height) => {
          scrollToInput(y, height);
        },
        () => {
          // Fallback: scroll by estimated amount
          scrollToInput(focusedInputY.current);
        }
      );
    } else {
      // Direct measure fallback
      inputRef.measure((x, y, width, height, pageX, pageY) => {
        scrollToInput(pageY - 100, height);
      });
    }
  }, [scrollToInput]);

  return {
    scrollRef,
    scrollY,
    registerInput,
    createFocusHandler,
    scrollToInput,
    scrollToInputRef,
  };
}

/**
 * Smooth animated scroll configuration for KeyboardAvoidingView
 */
export const keyboardAvoidingConfig = {
  ios: {
    behavior: 'padding' as const,
    keyboardVerticalOffset: 0,
  },
  android: {
    behavior: 'height' as const,
    keyboardVerticalOffset: 20,
  },
};

/**
 * Get platform-specific keyboard avoiding behavior
 */
export function getKeyboardAvoidingBehavior() {
  return Platform.OS === 'ios' ? 'padding' : 'height';
}
