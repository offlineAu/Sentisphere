import { StyleSheet, TextInput } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';

export default function JournalNewScreen() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">New Journal Entry</ThemedText>
      <TextInput placeholder="Title" style={styles.input} />
      <TextInput placeholder="What's on your mind?" multiline style={[styles.input, { height: 160 }]} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
});
