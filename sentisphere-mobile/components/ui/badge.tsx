import React from 'react';
import { View, Text, StyleSheet, ViewProps } from 'react-native';

export function Badge({ children, style, ...rest }: ViewProps & { children?: React.ReactNode }) {
  return (
    <View {...rest} style={[styles.badge, style]}>
      <Text style={styles.text}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: '#EEF2FF',
    borderColor: '#E5E7EB',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  text: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '600',
  },
});
