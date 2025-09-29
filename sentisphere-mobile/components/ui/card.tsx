import React from 'react';
import { View, StyleSheet, ViewProps } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

export function Card({ style, ...rest }: ViewProps) {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme] as any;
  const baseStyle = {
    borderRadius: 12,
    backgroundColor: palette.card ?? Colors.light.background,
    overflow: 'hidden' as const,
  } as const;

  const flattened = Array.isArray(style) ? style : [style];
  return <View {...rest} style={StyleSheet.flatten([baseStyle, ...flattened])} />;
}

export function CardContent({ style, ...rest }: ViewProps) {
  const flattened = Array.isArray(style) ? style : [style];
  return <View {...rest} style={StyleSheet.flatten([styles.content, ...flattened])} />;
}

const styles = StyleSheet.create({
  content: {
    padding: 12,
    gap: 8,
  },
});
