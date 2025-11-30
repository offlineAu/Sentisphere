import React, { useState } from 'react';
import { TextInput, StyleSheet, TextInputProps } from 'react-native';

const FOCUS_GREEN = '#0D8C4F';
const FOCUS_GREEN_SUBTLE = '#0D8C4F20'; // 12% opacity for subtle background

export function Input(props: TextInputProps) {
  const { style, onFocus, onBlur, placeholderTextColor, ...rest } = props;
  const [focused, setFocused] = useState(false);

  return (
    <TextInput
      {...rest}
      placeholderTextColor={placeholderTextColor ?? '#B5BAC1'}
      selectionColor={FOCUS_GREEN}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[
        styles.input,
        style,
        focused && { borderColor: FOCUS_GREEN, borderWidth: 1.5 },
        // @ts-ignore - web-specific property
        { outlineStyle: 'none' } as any,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
