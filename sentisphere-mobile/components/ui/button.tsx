import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, ViewStyle, TextStyle, Animated, Easing, ActivityIndicator, Platform } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import * as Haptics from 'expo-haptics';

export type ButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'outline' | 'ghost';
  style?: ViewStyle;
  textStyle?: TextStyle;
  disabled?: boolean;
  loading?: boolean;
};

export function Button({ title, onPress, variant = 'primary', style, textStyle, disabled, loading }: ButtonProps) {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme] as any;

  // Interactive animation
  const scale = useRef(new Animated.Value(1)).current;
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  const animateTo = (v: number, d = 140) =>
    Animated.timing(scale, { toValue: v, duration: d, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();

  const styles = StyleSheet.create({
    base: {
      borderRadius: 12,
      paddingVertical: 16,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: variant === 'outline' ? 1 : 0,
      borderColor: variant === 'outline' ? '#0d8c4f' : 'transparent',
      backgroundColor: 'transparent',
    },
    text: {
      color: variant === 'primary' ? '#fff' : palette.text,
      fontWeight: '600',
    },
  });

  // Compute dynamic background by variant and interaction
  const adjustLightness = (c: string, delta: number) => {
    // Supports 'hsl(h s% l%)' or '#rrggbb'
    const hsl = c.match(/hsl\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)/i);
    if (hsl) {
      const h = Number(hsl[1]);
      const s = Number(hsl[2]);
      const l = Math.max(0, Math.min(100, Number(hsl[3]) + delta));
      return `hsl(${h} ${s}% ${l}%)`;
    }
    if (c.startsWith('#')) {
      const hex = c.replace('#', '');
      const to = (i: number) => parseInt(hex.substring(i, i + 2), 16);
      if (hex.length === 6) {
        let r = to(0), g = to(2), b = to(4);
        const factor = 1 + delta / 100; // delta negative darkens
        r = Math.max(0, Math.min(255, Math.round(r * factor)));
        g = Math.max(0, Math.min(255, Math.round(g * factor)));
        b = Math.max(0, Math.min(255, Math.round(b * factor)));
        const toHex = (v: number) => v.toString(16).padStart(2, '0');
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
      }
    }
    return c;
  };

  const computedBackground = (() => {
    if (variant === 'primary') {
      if (disabled) return 'rgba(155, 161, 166, 0.3)';
      // Fuller color with slight variations for interaction
      if (pressed) return '#0a7043';
      if (hovered) return '#0b7d47';
      return '#0d8c4f';
    }
    if (variant === 'outline') {
      // Glass effect for outline variant
      if (pressed) return 'rgba(13, 140, 79, 0.15)';
      if (hovered) return 'rgba(13, 140, 79, 0.08)';
      return 'rgba(13, 140, 79, 0.05)';
    }
    // ghost subtle backgrounds
    if (pressed) return '#E5E7EB';
    if (hovered) return '#F3F4F6';
    return 'transparent';
  })();

  const combinedBase = StyleSheet.flatten([styles.base, { backgroundColor: computedBackground }, style]);

  return (
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      onHoverIn={() => { setHovered(true); animateTo(1.03, 150); }}
      onHoverOut={() => { setHovered(false); animateTo(1, 150); }}
      onPressIn={() => { setPressed(true); animateTo(0.98, 90); if (Platform.OS !== 'web') { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {} } }}
      onPressOut={() => { setPressed(false); animateTo(hovered ? 1.03 : 1, 130); }}
      style={combinedBase}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        {loading ? (
          <ActivityIndicator size="small" color={variant === 'primary' ? '#FFFFFF' : palette.text} />
        ) : (
          <ThemedText style={StyleSheet.flatten([styles.text, textStyle])}>{title}</ThemedText>
        )}
      </Animated.View>
    </Pressable>
  );
}
