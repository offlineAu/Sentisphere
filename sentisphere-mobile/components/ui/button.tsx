import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, ViewStyle, TextStyle, Animated, Easing } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

export type ButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'outline' | 'ghost';
  style?: ViewStyle;
  textStyle?: TextStyle;
  disabled?: boolean;
};

export function Button({ title, onPress, variant = 'primary', style, textStyle, disabled }: ButtonProps) {
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
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: variant === 'outline' ? 1 : 0,
      borderColor: palette.border,
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
      if (disabled) return '#9BA1A6';
      const base = palette.primary as string;
      if (pressed) return adjustLightness(base, -7);
      if (hovered) return adjustLightness(base, -4);
      return base;
    }
    // outline/ghost subtle backgrounds
    if (pressed) return '#E5E7EB';
    if (hovered) return '#F3F4F6';
    return 'transparent';
  })();

  const combinedBase = StyleSheet.flatten([styles.base, { backgroundColor: computedBackground }, style]);

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      onHoverIn={() => { setHovered(true); animateTo(1.03, 150); }}
      onHoverOut={() => { setHovered(false); animateTo(1, 150); }}
      onPressIn={() => { setPressed(true); animateTo(0.98, 90); }}
      onPressOut={() => { setPressed(false); animateTo(hovered ? 1.03 : 1, 130); }}
      style={combinedBase}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <ThemedText style={StyleSheet.flatten([styles.text, textStyle])}>{title}</ThemedText>
      </Animated.View>
    </Pressable>
  );
}
