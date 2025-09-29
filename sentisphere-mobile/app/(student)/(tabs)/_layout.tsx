import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { View } from 'react-native';

// Custom Tab Bar removed. Using default Tabs bar for stability on web.

export default function StudentTabsLayout() {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme];
  const tint = palette.tint;

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        // Explicit light theme styling
        headerStyle: { backgroundColor: palette.background },
        headerBackground: () => <View style={{ flex: 1, backgroundColor: palette.background }} />,
        headerTintColor: palette.text,
        headerTitleStyle: { color: palette.text },
        tabBarStyle: { backgroundColor: palette.background, borderTopColor: palette.border },
        tabBarItemStyle: { flex: 1, flexBasis: 0 },
        tabBarLabelStyle: { textAlign: 'center' },
        tabBarBackground: () => <View style={{ flex: 1, backgroundColor: palette.background }} />,
        tabBarActiveTintColor: tint,
        tabBarInactiveTintColor: palette.icon,
      }}
    >
      <Tabs.Screen
        name="dashboard/index"
        options={{
          title: 'Dashboard',
          tabBarLabel: 'Dashboard',
          tabBarIcon: ({ color, size }) => <Feather name="home" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="mood/index"
        options={{
          title: 'Mood',
          tabBarLabel: 'Mood',
          tabBarIcon: ({ color, size }) => <Feather name="heart" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="journal/index"
        options={{
          title: 'Journal',
          tabBarLabel: 'Journal',
          tabBarIcon: ({ color, size }) => <Feather name="book-open" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="learn/index"
        options={{
          title: 'Learn',
          tabBarLabel: 'Learn',
          tabBarIcon: ({ color, size }) => <Feather name="book" color={color} size={size} />,
        }}
      />
      {/* Hide pages from appearing as tabs, keep them routable */}
      <Tabs.Screen name="chat/index" options={{ tabBarButton: () => null }} />
      <Tabs.Screen name="journal/new" options={{ tabBarButton: () => null }} />
      <Tabs.Screen name="journal/[id]" options={{ tabBarButton: () => null }} />
    </Tabs>
  );
}
