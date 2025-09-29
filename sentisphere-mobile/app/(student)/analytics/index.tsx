import { StyleSheet } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';

export default function AnalyticsScreen() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Analytics</ThemedText>
      <ThemedText>Placeholder for AnalyticsSummary, MoodTrendsChart, and JournalInsights.</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
});
