import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Icon } from '@/components/ui/icon';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { View, Pressable, StyleSheet, Platform, Animated, Easing } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme] as any;
  const insets = useSafeAreaInsets();
  const [barWidth, setBarWidth] = useState(0);

  // Filter out routes explicitly hidden via href: null (expo-router)
  const hiddenNames = new Set(['chat/index', 'chat/[id]', 'journal/new', 'journal/[id]', 'learn/[id]']);
  const visibleRoutes = state.routes.filter((route) => {
    const opts = descriptors[route.key]?.options as any;
    if (opts?.href === null) return false;
    return !hiddenNames.has(route.name);
  });

  // Animated values per route
  const animsRef = useRef<Record<string, Animated.Value>>({});
  useEffect(() => {
    // Initialize any missing anim
    visibleRoutes.forEach((route) => {
      if (!animsRef.current[route.key]) {
        const isFocusedInit = state.routes[state.index]?.key === route.key;
        animsRef.current[route.key] = new Animated.Value(isFocusedInit ? 1 : 0);
      }
    });
    // Animate to current focus state (smoother ease)
    visibleRoutes.forEach((route) => {
      const toValue = state.routes[state.index]?.key === route.key ? 1 : 0;
      Animated.timing(animsRef.current[route.key], {
        toValue,
        duration: 280,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: true,
      }).start();
    });
  }, [state.index, visibleRoutes]);

  // Sliding indicator across tabs
  const indicatorX = useRef(new Animated.Value(0)).current;
  const barLift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const count = visibleRoutes.length || 1;
    const itemW = barWidth > 0 ? barWidth / count : 0;
    const i = Math.max(0, visibleRoutes.findIndex((r) => r.key === state.routes[state.index]?.key));
    const indicatorW = Math.min(48, Math.max(28, itemW * 0.42));
    const x = itemW * i + itemW / 2 - indicatorW / 2;

    Animated.parallel([
      Animated.spring(indicatorX, {
        toValue: isFinite(x) ? x : 0,
        stiffness: 320,
        damping: 24,
        mass: 0.9,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(barLift, {
          toValue: -2,
          duration: 120,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(barLift, {
          toValue: 0,
          stiffness: 260,
          damping: 20,
          mass: 0.8,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [state.index, barWidth, visibleRoutes]);

  return (
    <View style={[styles.tabWrap, { paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 12 : 8) }]}>
      <Animated.View
        style={[styles.tabBar, { transform: [{ translateY: barLift }] }]}
        onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
      >
        {/* Sliding indicator */}
        {barWidth > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.indicator,
              {
                backgroundColor: palette.tint,
                width: Math.min(48, Math.max(28, (barWidth / Math.max(1, visibleRoutes.length)) * 0.42)),
                transform: [{ translateX: indicatorX }],
              },
            ]}
          />
        )}
        {visibleRoutes.map((route) => {
          const options = descriptors[route.key].options as any;
          const label = options.tabBarLabel ?? options.title ?? route.name;
          const focusedIndex = state.index;
          const isFocused = state.routes[focusedIndex]?.key === route.key;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name as never);
            }
          };

          const onLongPress = () => {
            navigation.emit({ type: 'tabLongPress', target: route.key });
          };

          // Pick icon based on route name
          const n = route.name;
          let icon: any = 'home';
          if (n.includes('mood')) icon = 'heart';
          else if (n.includes('journal')) icon = 'book-open';
          else if (n.includes('learn')) icon = 'graduation-cap';

          // Route animation
          const anim = animsRef.current[route.key] ?? new Animated.Value(isFocused ? 1 : 0);
          animsRef.current[route.key] = anim;
          const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
          const iconOpacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] });
          const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -1] });
          const bgScale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] });

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              onLongPress={onLongPress}
              onPressIn={() => { if (Platform.OS !== 'web') { try { Haptics.selectionAsync() } catch {} } }}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              style={styles.tabItem}
            >
              <Animated.View
                pointerEvents="none"
                style={[styles.activeBg, { backgroundColor: palette.tint, opacity: anim, transform: [{ scale: bgScale }] }]}
              />
              <Animated.View style={{ transform: [{ scale }, { translateY }], opacity: iconOpacity }}>
                <Icon name={icon} size={22} color={isFocused ? '#FFFFFF' : palette.icon} />
              </Animated.View>
            </Pressable>
          );
        })}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabWrap: {
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#F8F9FA',
    borderRadius: 24,
    paddingVertical: 8,
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 6,
    gap: 8,
    overflow: 'visible',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 18,
    minHeight: 54,
    overflow: 'hidden',
  },
  activeBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1F2937',
    borderRadius: 18,
  },
  indicator: {
    position: 'absolute',
    bottom: 6,
    left: 0,
    height: 3,
    borderRadius: 3,
  },
});

export default function StudentTabsLayout() {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme];
  const tint = palette.tint;

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: true,
        // Explicit light theme styling
        headerStyle: { backgroundColor: palette.background },
        headerBackground: () => <View style={{ flex: 1, backgroundColor: palette.background }} />,
        headerTintColor: palette.text,
        headerTitleStyle: { color: palette.text },
        // Note: tabBar styling handled by CustomTabBar
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
      <Tabs.Screen name="learn/[id]" options={{ href: null }} />
      {/* Hide pages from appearing as tabs; keep them routable */}
      <Tabs.Screen name="chat/index" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="chat/[id]" options={{ href: null, headerShown: false }} />
      <Tabs.Screen name="journal/new" options={{ href: null }} />
      <Tabs.Screen name="journal/[id]" options={{ href: null }} />
    </Tabs>
  );
}
