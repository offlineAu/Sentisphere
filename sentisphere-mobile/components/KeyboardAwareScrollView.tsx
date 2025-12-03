import React, { useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import {
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  StyleSheet,
  ViewStyle,
  ScrollViewProps,
  Keyboard,
  Animated,
  Easing,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface KeyboardAwareScrollViewProps extends Omit<ScrollViewProps, 'ref'> {
  /** Background color for the container */
  backgroundColor?: string;
  /** Extra offset for keyboard (added to safe area calculation) */
  extraKeyboardOffset?: number;
  /** Whether to enable keyboard dismissal on scroll */
  keyboardDismissOnScroll?: boolean;
  /** Content container style */
  contentContainerStyle?: ViewStyle;
  /** Children */
  children: React.ReactNode;
}

export interface KeyboardAwareScrollViewRef {
  /** Scroll to a specific Y position */
  scrollTo: (options: { y: number; animated?: boolean }) => void;
  /** Scroll input into view with smooth animation - positions input comfortably above keyboard */
  scrollInputIntoView: (inputY: number, inputHeight?: number) => void;
  /** Get the underlying ScrollView ref */
  getScrollViewRef: () => ScrollView | null;
}

/**
 * KeyboardAwareScrollView
 * 
 * A consistent keyboard-aware scroll container that properly handles:
 * - iOS "padding" behavior with appropriate offset
 * - Android "height" behavior  
 * - Safe area insets
 * - Smooth scroll-to-input animations
 * - Consistent behavior across all screens
 * 
 * Key fixes applied:
 * 1. Removed automaticallyAdjustKeyboardInsets (conflicts with KeyboardAvoidingView)
 * 2. Uses proper keyboardVerticalOffset based on safe area
 * 3. Gentle scroll-to-input that respects safe areas and keeps input centered
 * 4. No white box above keyboard bug
 */
export const KeyboardAwareScrollView = forwardRef<KeyboardAwareScrollViewRef, KeyboardAwareScrollViewProps>(
  (
    {
      backgroundColor = '#FFFFFF',
      extraKeyboardOffset = 0,
      keyboardDismissOnScroll = true,
      contentContainerStyle,
      children,
      ...scrollViewProps
    },
    ref
  ) => {
    const insets = useSafeAreaInsets();
    const scrollViewRef = useRef<ScrollView>(null);
    const scrollAnimValue = useRef(new Animated.Value(0)).current;

    // Calculate keyboard vertical offset
    // iOS needs offset for status bar + any headers
    // Android handles this differently with "height" behavior
    const keyboardVerticalOffset = Platform.select({
      ios: insets.top + 10 + extraKeyboardOffset, // Safe area top + small buffer
      android: extraKeyboardOffset,
      default: 0,
    });

    /**
     * Smooth scroll input into view
     * Positions the input comfortably in the visible area (not at the very top)
     * Respects safe areas and keyboard height
     */
    const scrollInputIntoView = useCallback((inputY: number, inputHeight: number = 50) => {
      // Trigger subtle animation for visual feedback
      scrollAnimValue.setValue(0);
      Animated.timing(scrollAnimValue, {
        toValue: 1,
        duration: Platform.OS === 'android' ? 200 : 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();

      // Calculate target scroll position
      // Keep input in upper-middle area of visible screen (not at very top)
      // visibleOffset: how far from top of visible area the input should appear
      const visibleOffset = Platform.select({
        ios: 120, // Keep input ~120pt from top on iOS
        android: 100, // Keep input ~100pt from top on Android
        default: 120,
      });

      const targetY = Math.max(0, inputY - visibleOffset);

      // Platform-specific delay to sync with keyboard animation
      const delay = Platform.select({
        ios: 50,
        android: 100, // Android keyboard animation is slower
        default: 50,
      });

      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ y: targetY, animated: true });
      }, delay);
    }, [scrollAnimValue]);

    const scrollTo = useCallback((options: { y: number; animated?: boolean }) => {
      scrollViewRef.current?.scrollTo(options);
    }, []);

    const getScrollViewRef = useCallback(() => scrollViewRef.current, []);

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      scrollTo,
      scrollInputIntoView,
      getScrollViewRef,
    }), [scrollTo, scrollInputIntoView, getScrollViewRef]);

    return (
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={keyboardVerticalOffset}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={[
            styles.contentContainer,
            // Add bottom padding for Android to ensure content is scrollable above keyboard
            Platform.OS === 'android' && { paddingBottom: 120 },
            contentContainerStyle,
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={keyboardDismissOnScroll ? (Platform.OS === 'ios' ? 'interactive' : 'on-drag') : 'none'}
          showsVerticalScrollIndicator={false}
          // IMPORTANT: Do NOT use automaticallyAdjustKeyboardInsets with KeyboardAvoidingView
          // It causes the white box bug on iOS
          bounces={Platform.OS === 'ios'}
          overScrollMode="never"
          {...scrollViewProps}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }
);

KeyboardAwareScrollView.displayName = 'KeyboardAwareScrollView';

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
  },
});

export default KeyboardAwareScrollView;
