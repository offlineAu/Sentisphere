import { StyleSheet, View } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Link } from 'expo-router';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function JournalListScreen() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Journal</ThemedText>
      <ThemedText>Recent entries</ThemedText>

      <View style={{ gap: 8 }}>
        {[{ id: '1', title: 'Grateful for small wins', preview: 'Today I felt...' }, { id: '2', title: 'A challenging day', preview: 'Work was tough but...' }].map(
          (item) => (
            <Card key={item.id}>
              <CardContent>
                <ThemedText type="subtitle">{item.title}</ThemedText>
                <ThemedText numberOfLines={1}>{item.preview}</ThemedText>
                <Link
                  href={{
                    pathname: '/(student)/(tabs)/journal/[id]',
                    params: { id: item.id },
                  }}
                  asChild
                >
                  <Button title="Open" variant="outline" />
                </Link>
              </CardContent>
            </Card>
          ),
        )}
      </View>

      <Link href="/(student)/(tabs)/journal/new" asChild>
        <Button title="Start Journal Entry" style={{ marginTop: 12 }} />
      </Link>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
});
