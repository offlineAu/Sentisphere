import React from 'react';
import { TextInput, StyleSheet, TextInputProps } from 'react-native';

export function Textarea(props: TextInputProps) {
  return <TextInput {...props} multiline style={[styles.input, props.style, { height: props.style && (props.style as any).height ? (props.style as any).height : 120 }]} />;
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: 'top',
  },
});
