import React from 'react';
import { View, StyleSheet, ViewProps, Platform } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

export function Card({ style, children, ...rest }: ViewProps) {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme] as any;
  const baseStyle = {
    borderRadius: 24,
    backgroundColor: palette.card ?? Colors.light.background,
    overflow: 'hidden' as const,
  } as const;

  const flattened = Array.isArray(style) ? style : [style];
  const shadowStyle = Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
    },
    android: {
      elevation: 6,
      shadowColor: '#000',
    },
    default: {
      shadowColor: '#000',
      shadowOpacity: 0.06,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
    },
  });

  return (
    <View style={StyleSheet.flatten([styles.shadowContainer, shadowStyle])}>
      <View {...rest} style={StyleSheet.flatten([baseStyle, ...flattened])}>
        {children}
      </View>
    </View>
  );
}

export function CardContent({ style, ...rest }: ViewProps) {
  const flattened = Array.isArray(style) ? style : [style];
  return <View {...rest} style={StyleSheet.flatten([styles.content, ...flattened])} />;
}

const styles = StyleSheet.create({
  shadowContainer: {
    borderRadius: 24,
  },
  content: {
    padding: 12,
    gap: 8,
  },
});
