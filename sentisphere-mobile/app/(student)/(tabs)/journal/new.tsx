import { StyleSheet, TextInput } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { GlobalScreenWrapper } from '@/components/GlobalScreenWrapper';

export default function JournalNewScreen() {
  return (
    <GlobalScreenWrapper backgroundColor="#FFFFFF">
      <ThemedText type="title" style={{ paddingHorizontal: 16 }}>New Journal Entry</ThemedText>
      <TextInput placeholder="Title" style={[styles.input, { marginHorizontal: 16 }]} />
      <TextInput placeholder="What's on your mind?" multiline style={[styles.input, { height: 160, marginHorizontal: 16 }]} />
    </GlobalScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
});
