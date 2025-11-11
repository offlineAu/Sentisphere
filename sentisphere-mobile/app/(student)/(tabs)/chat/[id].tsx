import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, FlatList, TextInput, KeyboardAvoidingView, Platform, Pressable, useWindowDimensions, Alert, type AlertButton } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

 type Msg = { id: string; role: 'user' | 'ai'; text: string; time: string; createdAt: number; status?: 'sent' | 'delivered' | 'read' };

 export default function ChatDetailScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const [messages, setMessages] = useState<Msg[]>(() => {
    const now = Date.now();
    return [
      { id: 'm1', role: 'ai', text: `Hi ${name || 'there'}, how can I help today?`, time: '09:10 AM', createdAt: now - 1000 * 60 * 60 * 3 },
      { id: 'm2', role: 'user', text: 'I feel overwhelmed with tasks.', time: '09:12 AM', createdAt: now - 1000 * 60 * 60 * 3 + 2 * 60 * 1000, status: 'read' },
      { id: 'm3', role: 'ai', text: "Let's try breaking tasks into smaller steps.", time: '09:13 AM', createdAt: now - 1000 * 60 * 60 * 3 + 3 * 60 * 1000 },
    ];
  });
  const [input, setInput] = useState('');
  const [chatOpen, setChatOpen] = useState(true);
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme] as any;
  const listRef = useRef<FlatList<Msg>>(null);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const canSend = chatOpen && input.trim().length > 0;
  const [inputFocused, setInputFocused] = useState(false);
  const [typing, setTyping] = useState(false);
  const [inputHeight, setInputHeight] = useState(40);

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

  const formatDateLabel = (ts: number) => {
    const d = new Date(ts);
    const today = new Date();
    const yday = new Date();
    yday.setDate(today.getDate() - 1);
    const isSame = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    if (isSame(d, today)) return 'Today';
    if (isSame(d, yday)) return 'Yesterday';
    return d.toLocaleDateString();
  };

  const listData = useMemo(() => {
    const out: Array<any> = [];
    let lastLabel = '';
    for (const m of messages) {
      const label = formatDateLabel(m.createdAt);
      if (label !== lastLabel) {
        out.push({ type: 'sep', id: `sep-${label}-${m.createdAt}`, label });
        lastLabel = label;
      }
      out.push({ type: 'msg', ...m });
    }
    return out;
  }, [messages]);

  const send = async () => {
    const trimmed = input.trim();
    if (!trimmed || !chatOpen) return;
    await doHaptic('light');
    const tm = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const now = Date.now();
    const userMsg: Msg = { id: `${now}`, role: 'user', text: trimmed, time: tm, createdAt: now, status: 'sent' };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));

    // Simulate delivery/read and a brief typing indicator
    setTyping(true);
    setTimeout(() => {
      setMessages((prev) => prev.map((m) => (m.id === userMsg.id ? { ...m, status: 'delivered' } : m)));
    }, 400);
    setTimeout(() => {
      setMessages((prev) => prev.map((m) => (m.id === userMsg.id ? { ...m, status: 'read' } : m)));
      setTyping(false);
    }, 1200);
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

  const handleLongPress = (m: Msg) => {
    const actions: AlertButton[] = [
      { text: 'Copy', onPress: () => { try { if (Platform.OS === 'web') { /* @ts-ignore */ navigator?.clipboard?.writeText(m.text); } } catch {} } },
      { text: 'Delete', style: 'destructive', onPress: () => setMessages((prev) => prev.filter((x) => x.id !== m.id)) },
      { text: 'Cancel', style: 'cancel' },
    ];
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      Alert.alert('Message', 'Choose an action', actions);
    } else {
      const doCopy = confirm('Copy this message?');
      if (doCopy) { try { // @ts-ignore
        navigator?.clipboard?.writeText(m.text); } catch {} }
    }
  };

  const LoadEarlier = ({ onLoad, palette }: { onLoad: () => void; palette: any }) => (
    <View style={{ paddingVertical: 8, alignItems: 'center' }}>
      <Pressable onPress={onLoad} style={({ pressed }) => [{
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.background,
        opacity: pressed ? 0.9 : 1,
      }]}>
        <ThemedText style={{ color: palette.tint, fontFamily: 'Inter_600SemiBold' }}>Load earlier</ThemedText>
      </Pressable>
    </View>
  );

  const TypingIndicator = ({ palette }: { palette: any }) => (
    <View style={{ paddingVertical: 8, paddingHorizontal: 12 }}>
      <View style={{ alignSelf: 'flex-start', backgroundColor: palette.background, borderColor: palette.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
        <ThemedText style={{ color: palette.muted }}>Typing...</ThemedText>
      </View>
    </View>
  );

  const loadEarlier = () => {
    const base = messages.length ? messages[0].createdAt : Date.now();
    const older: Msg[] = [
      { id: `old-${base-600000}`, role: 'ai', text: 'Earlier note: remember to hydrate.', time: '07:55 AM', createdAt: base - 600000 },
      { id: `old-${base-570000}`, role: 'user', text: 'Thanks, I will.', time: '07:58 AM', createdAt: base - 570000, status: 'read' },
    ];
    setMessages((prev) => [...older, ...prev]);
  };

  const renderRow = ({ item }: { item: any }) => {
    if (item.type === 'sep') {
      return (
        <View style={styles.sepWrap}>
          <ThemedText style={[styles.sepText, { color: palette.muted }]}>{item.label}</ThemedText>
        </View>
      );
    }
    const m: Msg = item as Msg;
    const isUser = m.role === 'user';
    const statusMarks = isUser ? (m.status === 'read' ? '✓✓' : m.status === 'delivered' ? '✓✓' : '✓') : '';
    const statusColor = isUser ? (m.status === 'read' ? palette.tint : palette.muted) : palette.muted;
    return (
      <View style={[styles.row, { justifyContent: isUser ? 'flex-end' : 'flex-start' }]}> 
        <View style={[styles.messageWrap, { alignItems: isUser ? 'flex-end' : 'flex-start' }]}> 
          <Pressable onLongPress={() => handleLongPress(m)} style={[
            styles.bubble,
            isUser
              ? { backgroundColor: palette.tint, borderTopRightRadius: 4 }
              : { backgroundColor: palette.background, borderTopLeftRadius: 4, borderWidth: 1, borderColor: palette.border },
          ]}>
            <ThemedText style={{ color: isUser ? '#FFFFFF' : palette.text }}>{m.text}</ThemedText>
          </Pressable>
          <View style={[styles.metaLine, { justifyContent: isUser ? 'flex-end' : 'flex-start' }]}> 
            <ThemedText style={[styles.timeText, { color: palette.muted }]}>{m.time}</ThemedText>
            {isUser && (
              <ThemedText style={[styles.statusText, { color: statusColor }]}>{statusMarks}</ThemedText>
            )}
          </View>
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
              onPress={() => router.replace('/(student)/(tabs)/dashboard')}
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
            data={listData}
            keyExtractor={(it) => it.id}
            renderItem={renderRow}
            contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12, paddingBottom: 6 }}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            initialNumToRender={12}
            maxToRenderPerBatch={24}
            windowSize={7}
            updateCellsBatchingPeriod={50}
            removeClippedSubviews
            ListHeaderComponent={<LoadEarlier onLoad={() => loadEarlier()} palette={palette} />}
            ListFooterComponent={typing ? <TypingIndicator palette={palette} /> : null}
          />

          <View style={[styles.inputBarWrap, { borderTopColor: palette.border, backgroundColor: palette.background, paddingBottom: insets.bottom || 8 }]}> 
            <View
              style={[
                styles.inputBar,
                {
                  backgroundColor: palette.background,
                  borderColor: inputFocused ? palette.tint : palette.border,
                  borderWidth: inputFocused ? 2 : 1,
                },
              ]}
            > 
              <Pressable onPressIn={() => doHaptic('light')} style={({ pressed }) => [styles.attachBtn, { opacity: pressed ? 0.8 : 1 }]} accessibilityRole="button" accessibilityLabel="Add attachment">
                <Icon name="plus" size={18} color={palette.icon} />
              </Pressable>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder={chatOpen ? 'Type your message...' : 'Chat is closed'}
                placeholderTextColor={palette.muted}
                style={[styles.input, { height: inputHeight }]}
                onSubmitEditing={send}
                editable={chatOpen}
                multiline
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                selectionColor={palette.tint}
                underlineColorAndroid="transparent"
                onContentSizeChange={(e) => setInputHeight(Math.min(120, Math.max(40, e.nativeEvent.contentSize.height)))}
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
  container: { flex: 1 },
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
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  statusText: { fontSize: 11 },
  sepWrap: { alignSelf: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, marginVertical: 8 },
  sepText: { fontSize: 12 },
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
  input: { flex: 1, padding: 8, fontSize: 18, lineHeight: 22 },
  closedNotice: { paddingHorizontal: 16, paddingBottom: 12 },
});
