import { StyleSheet, View } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Card, CardContent } from '@/components/ui/card';
import { Image } from 'expo-image';

const topics = [
  {
    id: 'personal-growth',
    title: 'Personal Growth',
    description: 'Build habits and reflective practices.',
    image: require('@/assets/images/personal-growth.png'),
  },
  {
    id: 'stress-management',
    title: 'Stress Management',
    description: 'Strategies to navigate stressful periods.',
    image: require('@/assets/images/stress-management.png'),
  },
];

export default function LearnScreen() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Learn</ThemedText>
      <ThemedText>Explore topics</ThemedText>

      <View style={styles.grid}>
        {topics.map((topic) => (
          <Card key={topic.id} style={styles.tile}>
            <Image
              source={topic.image}
              style={styles.tileImage}
              contentFit="cover"
              placeholder="blurhash"
              placeholderContentFit="cover"
            />
            <CardContent>
              <ThemedText type="subtitle">{topic.title}</ThemedText>
              <ThemedText numberOfLines={2}>{topic.description}</ThemedText>
            </CardContent>
          </Card>
        ))}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  grid: {
    flexDirection: 'row',
    gap: 12,
  },
  tile: { flex: 1 },
  tileImage: { width: '100%', height: 120, borderRadius: 8 },
});

