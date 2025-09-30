import React from 'react';
import { View, StyleSheet, ViewProps } from 'react-native';

export function Separator({ style, ...rest }: ViewProps) {
  return <View {...rest} style={[styles.sep, style]} />;
}

const styles = StyleSheet.create({
  sep: {
    height: 1,
    backgroundColor: '#E5E7EB',
    width: '100%',
  },
});
