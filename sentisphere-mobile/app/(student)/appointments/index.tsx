import { StyleSheet } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';

export default function AppointmentsScreen() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Appointments</ThemedText>
      <ThemedText>Placeholder for AppointmentForm and UpcomingAppointments.</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
});
