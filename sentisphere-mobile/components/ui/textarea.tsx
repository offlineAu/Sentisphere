import React from 'react';
import { TextInput, StyleSheet, TextInputProps } from 'react-native';

export function Textarea(props: TextInputProps) {
  const { style, placeholderTextColor, ...rest } = props;
  return (
    <TextInput
      {...rest}
      multiline
      placeholderTextColor={placeholderTextColor ?? '#9BA1A6'}
      style={[
        styles.input,
        style,
        { height: style && (style as any).height ? (style as any).height : 120 },
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
