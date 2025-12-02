import { StyleSheet } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { GlobalScreenWrapper } from '@/components/GlobalScreenWrapper';

export default function AnalyticsScreen() {
  return (
    <GlobalScreenWrapper backgroundColor="#FFFFFF">
      <ThemedText type="title" style={{ paddingHorizontal: 16 }}>Analytics</ThemedText>
      <ThemedText style={{ paddingHorizontal: 16 }}>Placeholder for AnalyticsSummary, MoodTrendsChart, and JournalInsights.</ThemedText>
    </GlobalScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
});
