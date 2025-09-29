import { StyleSheet, View } from 'react-native';
import { useState } from 'react';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

type Mood = { emoji: string; label: string };

export default function MoodScreen() {
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme] as any;

  const moods: Mood[] = [
    { emoji: '😊', label: 'Happy' },
    { emoji: '😐', label: 'Neutral' },
    { emoji: '😔', label: 'Sad' },
    { emoji: '😡', label: 'Angry' },
    { emoji: '😰', label: 'Anxious' },
  ];

  const handleSubmit = () => {
    if (!selectedMood) return;
    // Persist later; for now just show confirmation
    setSubmitted(true);
  };

  const reset = () => {
    setSelectedMood(null);
    setNote('');
    setSubmitted(false);
  };

  if (submitted) {
    return (
      <ThemedView style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}> 
        <ThemedText style={{ marginBottom: 8 }}>Thanks for checking in today!</ThemedText>
        <ThemedText style={{ color: palette.muted, textAlign: 'center', marginBottom: 12 }}>
          Your mood has been recorded. Remember that it's okay to not be okay.
        </ThemedText>
        <Button title="Check in again" variant="outline" onPress={reset} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Mood Survey</ThemedText>
      <View style={styles.moodsRow}>
        {moods.map((m) => {
          const active = selectedMood === m.label;
          return (
            <View key={m.label} style={[styles.moodBtn, active && { backgroundColor: '#E6F4FE' }]}> 
              <ThemedText style={styles.emoji} onPress={() => setSelectedMood(m.label)}>
                {m.emoji}
              </ThemedText>
              <ThemedText style={styles.moodLabel}>{m.label}</ThemedText>
            </View>
          );
        })}
      </View>

      <Textarea
        placeholder="Add a note about how you're feeling (optional)"
        value={note}
        onChangeText={setNote}
        style={{ height: 120 }}
      />

      <Button title="Submit" onPress={handleSubmit} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  moodsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  moodBtn: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  emoji: { fontSize: 24, marginBottom: 4 },
  moodLabel: { fontSize: 12 },
});
