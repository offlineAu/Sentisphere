import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface GlobalScreenWrapperProps {
  children: React.ReactNode;
  /** Background color - defaults to light gray */
  backgroundColor?: string;
  /** Horizontal padding - defaults to 16 */
  horizontalPadding?: number;
  /** Extra top padding beyond safe area - defaults to 12 */
  topPadding?: number;
  /** Extra bottom padding - defaults to 0 (tab bar handles this) */
  bottomPadding?: number;
  /** Whether to apply horizontal padding - defaults to true */
  applyHorizontalPadding?: boolean;
  /** Custom style overrides */
  style?: ViewStyle;
  /** If true, fills entire screen with flex: 1 */
  flex?: boolean;
}

/**
 * GlobalScreenWrapper
 * 
 * A consistent wrapper for all screens that handles:
 * - Safe area insets (notch, status bar, home indicator)
 * - Consistent top padding below the notch
 * - Optional horizontal padding
 * - Background color
 * 
 * Usage:
 * ```tsx
 * <GlobalScreenWrapper>
 *   <YourContent />
 * </GlobalScreenWrapper>
 * ```
 */
export function GlobalScreenWrapper({
  children,
  backgroundColor = '#F7F9FA',
  horizontalPadding = 0,
  topPadding = 12,
  bottomPadding = 0,
  applyHorizontalPadding = false,
  style,
  flex = true,
}: GlobalScreenWrapperProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        flex && styles.flex,
        {
          backgroundColor,
          paddingTop: insets.top + topPadding,
          paddingBottom: bottomPadding,
          paddingHorizontal: applyHorizontalPadding ? horizontalPadding : 0,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * Hook to get safe area values for custom implementations
 */
export function useSafeAreaPadding(extraTop: number = 12) {
  const insets = useSafeAreaInsets();
  return {
    paddingTop: insets.top + extraTop,
    paddingBottom: insets.bottom,
    paddingLeft: insets.left,
    paddingRight: insets.right,
    insets,
  };
}

const styles = StyleSheet.create({
  container: {
    // Base styles
  },
  flex: {
    flex: 1,
  },
});

export default GlobalScreenWrapper;
