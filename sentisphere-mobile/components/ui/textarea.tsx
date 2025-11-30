import React, { useState } from 'react';
import { TextInput, StyleSheet, TextInputProps } from 'react-native';

const FOCUS_GREEN = '#0D8C4F';
const FOCUS_GREEN_SUBTLE = '#0D8C4F12'; // 7% opacity for subtle background

export function Textarea(props: TextInputProps) {
  const { style, placeholderTextColor, onFocus, onBlur, ...rest } = props;
  const [focused, setFocused] = useState(false);

  return (
    <TextInput
      {...rest}
      multiline
      placeholderTextColor={placeholderTextColor ?? '#9BA1A6'}
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
        { height: style && (style as any).height ? (style as any).height : 120 },
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
    textAlignVertical: 'top',
    backgroundColor: '#FFFFFF',
    color: '#000000',
  },
});
