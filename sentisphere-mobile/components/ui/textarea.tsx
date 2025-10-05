import React, { useState } from 'react';
import { TextInput, StyleSheet, TextInputProps } from 'react-native';

export function Textarea(props: TextInputProps) {
  const { style, placeholderTextColor, onFocus, onBlur, ...rest } = props;
  const focusBlue = '#3B82F6';
  const [focused, setFocused] = useState(false);

  return (
    <TextInput
      {...rest}
      multiline
      placeholderTextColor={placeholderTextColor ?? '#9BA1A6'}
      selectionColor={focusBlue}
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
        focused && { borderColor: focusBlue },
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
