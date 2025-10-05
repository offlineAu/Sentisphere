import { StyleSheet, View, FlatList, TextInput, KeyboardAvoidingView, Platform, Pressable, useWindowDimensions } from 'react-native';
import { useState, useRef } from 'react';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { Card, CardContent } from '@/components/ui/card';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Msg = { id: string; role: 'user' | 'ai'; text: string; time: string };

const initialMessages: Msg[] = [
  { id: 'm1', role: 'ai', text: "Thanks for sharing, Mark. Let's try breaking tasks into smaller steps.", time: '03:38 AM' },
  { id: 'm2', role: 'user', text: "Yes, I'll try that out this week!", time: '04:38 AM' },
  { id: 'm3', role: 'ai', text: 'Yes, Do that!', time: '12:11 PM' },
];

type Counselor = { id: string; name: string; title: string; lastMessage: string; lastTime: string; unreadCount: number };
const COUNSELORS: Counselor[] = [
  { id: 'sarah', name: 'Dr. Sarah Johnson', title: 'Licensed Counselor', lastMessage: 'Let’s review your plan this week.', lastTime: '2:10 PM', unreadCount: 2 },
  { id: 'marco', name: 'Marco Lee', title: 'Mental Health Coach', lastMessage: 'How did the breathing exercise go?', lastTime: '1:34 PM', unreadCount: 0 },
  { id: 'emma', name: 'Emma Clark', title: 'Therapist, CBT', lastMessage: 'See you Thursday!', lastTime: 'Yesterday', unreadCount: 0 },
  { id: 'alex', name: 'Alex Kim', title: 'Wellness Counselor', lastMessage: 'Great progress noted.', lastTime: 'Mon', unreadCount: 1 },
];

export default function ChatScreen() {
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState('');
  const [chatOpen, setChatOpen] = useState(true);
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme] as any;
  const listRef = useRef<FlatList<Msg>>(null);
  const { width } = useWindowDimensions();
  const isTablet = width >= 900;
  const insets = useSafeAreaInsets();

  const doHaptic = async (kind: 'light' | 'selection' | 'success' = 'light') => {
    if (Platform.OS === 'web') return;
    try {
      if (kind === 'success') return await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (kind === 'selection') return await Haptics.selectionAsync();
      return await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
  };

  const toggleChat = async () => {
    await doHaptic('selection');
    setChatOpen((o) => !o);
  };

  const StatusBadge = ({ open }: { open: boolean }) => (
    <View
      style={StyleSheet.flatten([
        styles.badge,
        open ? { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' } : { backgroundColor: '#FEE2E2', borderColor: '#FECACA' },
      ])}
    >
      <ThemedText style={[styles.badgeText, { color: open ? '#166534' : '#991B1B' }]}>{open ? 'Open' : 'Closed'}</ThemedText>
    </View>
  );

  const ConversationItem = () => (
    <Pressable
      onPressIn={() => doHaptic('selection')}
      style={({ pressed }) => [
        styles.convItem,
        { backgroundColor: pressed ? '#F3F4F6' : '#F8FAFC', borderColor: palette.border },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Conversation with Marky"
    >
      <View style={styles.convLeft}>
        <View style={styles.avatar}><ThemedText style={{ color: '#FFFFFF', fontFamily: 'Inter_700Bold' }}>M</ThemedText></View>
        <View style={{ gap: 2 }}>
          <ThemedText style={{ fontFamily: 'Inter_600SemiBold' }}>Marky</ThemedText>
          <ThemedText style={{ color: palette.muted, fontSize: 12 }}>Last active 3m ago</ThemedText>
        </View>
      </View>
      <StatusBadge open={chatOpen} />
    </Pressable>
  );

  const ChatHeader = () => (
    <View style={styles.chatHeader}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={styles.avatar}><ThemedText style={{ color: '#FFFFFF', fontFamily: 'Inter_700Bold' }}>M</ThemedText></View>
        <View>
          <ThemedText type="subtitle" style={{ fontSize: 18 }}>Marky</ThemedText>
          <ThemedText style={{ color: palette.muted, fontSize: 12 }}>Counseling Conversation</ThemedText>
        </View>
      </View>
      <Pressable onPress={toggleChat} onPressIn={() => doHaptic('selection')} style={({ pressed }) => [styles.toggleBtn, { opacity: pressed ? 0.9 : 1, borderColor: palette.border }]}> 
        <StatusBadge open={chatOpen} />
      </Pressable>
    </View>
  );

  const renderItem = ({ item }: { item: Msg }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.row, { justifyContent: isUser ? 'flex-end' : 'flex-start' }]}> 
        <View style={[styles.messageWrap, { alignItems: isUser ? 'flex-end' : 'flex-start' }]}> 
          <View
            style={StyleSheet.flatten([
              styles.bubble,
              isUser
                ? { backgroundColor: palette.tint, borderTopRightRadius: 4 }
                : { backgroundColor: '#F3F4F6', borderTopLeftRadius: 4 },
            ])}
          >
            <ThemedText style={{ color: isUser ? '#FFFFFF' : palette.text }}>{item.text}</ThemedText>
          </View>
          <ThemedText style={[styles.timeText, { textAlign: isUser ? 'right' : 'left', color: palette.muted }]}>{item.time}</ThemedText>
        </View>
      </View>
    );
  };

  const send = async () => {
    const trimmed = input.trim();
    if (!trimmed || !chatOpen) return;
    await doHaptic('light');
    const tm = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const userMsg: Msg = { id: `${Date.now()}`, role: 'user', text: trimmed, time: tm };
    const next: Msg[] = [...messages, userMsg];
    setMessages(next);
    setInput('');
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ThemedView style={[styles.container, { paddingTop: insets.top + 24 }]}> 
        <View style={{ alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <View style={styles.headerRow}>
            <View style={[styles.headerIcon, { backgroundColor: palette.background, borderColor: palette.border }]}><Icon name="message-square" size={18} color={palette.tint} /></View>
            <ThemedText type="subtitle" style={{ fontSize: 20 }}>Chat</ThemedText>
          </View>
          <ThemedText style={{ color: palette.muted, fontSize: 13, textAlign: 'center' }}>Manage and respond to student concerns</ThemedText>
        </View>

        <View style={styles.main}>
          <Card>
            <CardContent style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.iconPill, { backgroundColor: palette.background, borderColor: palette.border }]}><Icon name="message-square" size={16} color={palette.tint} /></View>
                <ThemedText type="subtitle" style={{ fontSize: 16 }}>Conversations</ThemedText>
              </View>

              {COUNSELORS.map((c) => (
                <Pressable
                  key={c.id}
                  onPressIn={() => doHaptic('selection')}
                  onPress={() => router.push({ pathname: '/(student)/(tabs)/chat/[id]', params: { id: c.id, name: c.name } })}
                  style={({ pressed }) => [styles.convItem, { backgroundColor: palette.background, borderColor: palette.border, opacity: pressed ? 0.96 : 1 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Open chat with ${c.name}`}
                >
                  <View style={styles.convLeft}>
                    <View style={[styles.avatar, { backgroundColor: palette.primary }]}><ThemedText style={{ color: '#FFFFFF', fontFamily: 'Inter_700Bold' }}>{c.name[0]}</ThemedText></View>
                    <View style={{ gap: 2 }}>
                      <ThemedText style={{ fontFamily: 'Inter_600SemiBold' }}>{c.name}</ThemedText>
                      <ThemedText style={{ color: palette.muted, fontSize: 12 }} numberOfLines={1}>{c.lastMessage}</ThemedText>
                    </View>
                  </View>
                  <View style={styles.rightMeta}>
                    <ThemedText style={{ color: palette.muted, fontSize: 12 }}>{c.lastTime}</ThemedText>
                    {c.unreadCount > 0 && (
                      <View style={[styles.unreadBadge, { backgroundColor: palette.tint }]}>
                        <ThemedText style={{ color: '#FFFFFF', fontSize: 11, fontFamily: 'Inter_600SemiBold' }}>{c.unreadCount}</ThemedText>
                      </View>
                    )}
                  </View>
                </Pressable>
              ))}
            </CardContent>
          </Card>
        </View>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  // Layout
  container: { flex: 1 },
  main: { flex: 1, padding: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  sidebar: { width: 320, maxWidth: 360 },
  chatPanel: { flex: 1 },
  chatPanelInner: { minHeight: 420 },

  // Header & status
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  toggleBtn: {
    borderWidth: 1,
    borderRadius: 999,
    padding: 4,
    backgroundColor: 'transparent',
  },
  badge: {
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  badgeText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },

  // Sidebar conversation item
  convItem: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  convLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightMeta: { alignItems: 'flex-end', gap: 6 },
  unreadBadge: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  iconPill: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },

  // Messages
  row: { flexDirection: 'row', marginVertical: 6 },
  messageWrap: { maxWidth: '82%', alignItems: 'flex-start' },
  bubble: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, maxWidth: '100%' },
  timeText: { fontSize: 11, marginTop: 4 },

  // Composer
  inputBarWrap: { borderTopWidth: 1, backgroundColor: '#FFFFFF' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
    margin: 12,
    gap: 8,
  },
  attachBtn: { padding: 8, borderRadius: 10 },
  input: { flex: 1, padding: 8 },
  sendBtn: { padding: 6 },
  closedNotice: { paddingHorizontal: 16, paddingBottom: 12 },
});
