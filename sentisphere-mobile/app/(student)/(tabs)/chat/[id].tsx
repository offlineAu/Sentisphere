import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, FlatList, TextInput, KeyboardAvoidingView, Platform, Pressable, useWindowDimensions } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

 type Msg = { id: string; role: 'user' | 'ai'; text: string; time: string };

 export default function ChatDetailScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const [messages, setMessages] = useState<Msg[]>([
    { id: 'm1', role: 'ai', text: `Hi ${name || 'there'}, how can I help today?`, time: '09:10 AM' },
    { id: 'm2', role: 'user', text: 'I feel overwhelmed with tasks.', time: '09:12 AM' },
    { id: 'm3', role: 'ai', text: "Let's try breaking tasks into smaller steps.", time: '09:13 AM' },
  ]);
  const [input, setInput] = useState('');
  const [chatOpen, setChatOpen] = useState(true);
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme] as any;
  const listRef = useRef<FlatList<Msg>>(null);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const canSend = chatOpen && input.trim().length > 0;

  const doHaptic = async (kind: 'light' | 'selection' | 'success' = 'light') => {
    if (Platform.OS === 'web') return;
    try {
      if (kind === 'success') return await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (kind === 'selection') return await Haptics.selectionAsync();
      return await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
  };

  useEffect(() => {
    // Scroll to bottom on mount or when messages grow
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 0);
    return () => clearTimeout(t);
  }, []);

  const send = async () => {
    const trimmed = input.trim();
    if (!trimmed || !chatOpen) return;
    await doHaptic('light');
    const tm = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const userMsg: Msg = { id: `${Date.now()}`, role: 'user', text: trimmed, time: tm };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  };

  const toggleChat = async () => {
    await doHaptic('selection');
    setChatOpen((o) => !o);
  };

  const StatusBadge = ({ open }: { open: boolean }) => (
    <View style={[styles.badge, { backgroundColor: palette.background, borderColor: palette.border }]}>
      <ThemedText style={[styles.badgeText, { color: open ? (palette.learningAccent ?? '#16A34A') : (palette.destructive ?? '#DC2626') }]}>{open ? 'Open' : 'Closed'}</ThemedText>
    </View>
  );

  const renderItem = ({ item }: { item: Msg }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.row, { justifyContent: isUser ? 'flex-end' : 'flex-start' }]}> 
        <View style={[styles.messageWrap, { alignItems: isUser ? 'flex-end' : 'flex-start' }]}> 
          <View style={[
            styles.bubble,
            isUser
              ? { backgroundColor: palette.tint, borderTopRightRadius: 4 }
              : { backgroundColor: palette.background, borderTopLeftRadius: 4, borderWidth: 1, borderColor: palette.border },
          ]}>
            <ThemedText style={{ color: isUser ? '#FFFFFF' : palette.text }}>{item.text}</ThemedText>
          </View>
          <ThemedText style={[styles.timeText, { textAlign: isUser ? 'right' : 'left', color: palette.muted }]}>{item.time}</ThemedText>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ThemedView style={[styles.container, { paddingTop: insets.top }] }>
        <Stack.Screen options={{ title: (name as string) || 'Chat' }} />
        {/* In-app header */}
        <View style={[styles.chatHeader, { backgroundColor: palette.background, borderBottomColor: palette.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              onPressIn={() => { if (Platform.OS !== 'web') { try { Haptics.selectionAsync() } catch {} } }}
              onPress={() => router.replace('/(student)/(tabs)/chat')}
              style={({ pressed }) => ({ padding: 6, borderRadius: 10, opacity: pressed ? 0.7 : 1 })}
            >
              <Icon name="arrow-left" size={20} color={palette.text} />
            </Pressable>
            <View style={[styles.avatar, { backgroundColor: palette.primary }]}><ThemedText style={{ color: '#FFFFFF', fontFamily: 'Inter_700Bold' }}>{(name || 'C')?.[0]?.toString().toUpperCase()}</ThemedText></View>
            <View>
              <ThemedText type="subtitle" style={{ fontSize: 18 }}>{name || 'Counselor'}</ThemedText>
              <ThemedText style={{ color: palette.muted, fontSize: 12 }}>Counseling Conversation</ThemedText>
            </View>
          </View>
          <Pressable onPress={toggleChat} onPressIn={() => doHaptic('selection')} style={({ pressed }) => [styles.toggleBtn, { opacity: pressed ? 0.9 : 1, borderColor: palette.border }]}> 
            <StatusBadge open={chatOpen} />
          </Pressable>
        </View>

        {/* Chat list + Composer */}
        <View style={{ flex: 1 }}>
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={renderItem}
            contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12, paddingBottom: 6 }}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          />

          <View style={[styles.inputBarWrap, { borderTopColor: palette.border, backgroundColor: palette.background, paddingBottom: insets.bottom || 8 }]}> 
            <View style={[styles.inputBar, { borderColor: palette.border, backgroundColor: palette.background }]}> 
              <Pressable onPressIn={() => doHaptic('light')} style={({ pressed }) => [styles.attachBtn, { opacity: pressed ? 0.8 : 1 }]} accessibilityRole="button" accessibilityLabel="Add attachment">
                <Icon name="plus" size={18} color={palette.icon} />
              </Pressable>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder={chatOpen ? 'Type your message...' : 'Chat is closed'}
                placeholderTextColor={palette.muted}
                style={styles.input}
                onSubmitEditing={send}
                editable={chatOpen}
              />
              <Pressable
                disabled={!canSend}
                onPress={send}
                onPressIn={() => canSend && doHaptic('light')}
                accessibilityRole="button"
                accessibilityLabel="Send message"
                style={({ pressed }) => ({ padding: 6, borderRadius: 8, opacity: !canSend ? 0.4 : (pressed ? 0.6 : 1) })}
              >
                <Icon name="send" size={20} color={palette.text} />
              </Pressable>
            </View>
            {!chatOpen && (
              <View style={styles.closedNotice}>
                <ThemedText style={{ fontSize: 13, color: palette.muted }}>This chat is closed. Tap the status to reopen.</ThemedText>
              </View>
            )}
          </View>
        </View>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

 const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
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
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', marginVertical: 6 },
  messageWrap: { maxWidth: '82%', alignItems: 'flex-start' },
  bubble: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, maxWidth: '100%' },
  timeText: { fontSize: 11, marginTop: 4 },
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
  closedNotice: { paddingHorizontal: 16, paddingBottom: 12 },
});
