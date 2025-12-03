import { useRef, useCallback, useEffect } from 'react';
import { Animated, Keyboard, Platform, ScrollView, TextInput, Easing, LayoutAnimation, UIManager, InteractionManager } from 'react-native';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Platform-specific delays for keyboard animation timing
const SCROLL_DELAY = Platform.select({
  ios: 80,
  android: 150, // Android needs longer delay since keyboardDidShow fires after keyboard is visible
  default: 100,
});

const ANIMATION_DURATION = Platform.select({
  ios: 280,
  android: 220, // Slightly faster on Android for snappier feel
  default: 280,
});

interface UseKeyboardMagnetOptions {
  /** Extra offset from the top of visible area (default: 40) - lower value = input appears lower on screen */
  extraOffset?: number;
  /** Animation duration in ms (default: platform-specific) */
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
    extraOffset = 40, // Reduced from 120 - keeps input more visible and not too high
    animationDuration = ANIMATION_DURATION,
    useSpring = true,
  } = options;

  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const inputRefs = useRef<Map<string, TextInput>>(new Map());
  const focusedInputY = useRef<number>(0);
  const keyboardHeight = useRef<number>(0);
  const keyboardVisible = useRef<boolean>(false);

  // Track keyboard show/hide
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        keyboardHeight.current = e.endCoordinates.height;
        keyboardVisible.current = true;
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        keyboardHeight.current = 0;
        keyboardVisible.current = false;
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
    delay: number = SCROLL_DELAY
  ) => {
    // Use InteractionManager on Android for smoother transitions
    const doScroll = () => {
      const targetY = Math.max(0, inputY - extraOffset);
      
      if (useSpring && Platform.OS !== 'android') {
        // Use LayoutAnimation for smooth native feel (iOS only - can cause issues on some Android devices)
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
    };

    // Wait for keyboard animation
    setTimeout(() => {
      if (Platform.OS === 'android') {
        // On Android, use InteractionManager to ensure smooth animation
        InteractionManager.runAfterInteractions(doScroll);
      } else {
        doScroll();
      }
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
    keyboardVisible,
  };
}

/**
 * Standalone scroll helper for screens not using the full hook
 * Use this for simple cases where you just need to scroll on focus
 */
export function createScrollToInput(
  scrollRef: React.RefObject<ScrollView>,
  options: { extraOffset?: number } = {}
) {
  const { extraOffset = 40 } = options; // Reduced from 120
  
  return (yOffset: number) => {
    const delay = Platform.OS === 'android' ? 150 : 80;
    const targetY = Math.max(0, yOffset - extraOffset);
    
    setTimeout(() => {
      if (Platform.OS === 'android') {
        InteractionManager.runAfterInteractions(() => {
          scrollRef.current?.scrollTo({ y: targetY, animated: true });
        });
      } else {
        scrollRef.current?.scrollTo({ y: targetY, animated: true });
      }
    }, delay);
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
