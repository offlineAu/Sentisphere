import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, FlatList, TextInput, KeyboardAvoidingView, Platform, Pressable, useWindowDimensions, Alert, type AlertButton } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

 type Msg = { id: string; role: 'user' | 'ai'; text: string; time: string; createdAt: number; status?: 'sent' | 'delivered' | 'read' };

 type ApiMessage = {
  message_id: number;
  conversation_id: number;
  sender_id: number;
  content: string;
  is_read: boolean;
  timestamp: string;
 };

 type ApiConversation = {
  conversation_id: number;
  initiator_user_id: number;
  initiator_role: string;
  subject?: string | null;
  status: 'open' | 'ended';
  created_at: string;
  last_activity_at?: string | null;
  messages?: ApiMessage[];
 };

 export default function ChatDetailScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const [messages, setMessages] = useState<Msg[]>([]);
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
  const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:8010';
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [conv, setConv] = useState<ApiConversation | null>(null);

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

  const getAuthToken = React.useCallback(async (): Promise<string | null> => {
    if (Platform.OS === 'web') {
      try { return (window as any)?.localStorage?.getItem('auth_token') || null } catch { return null }
    }
    try { return await SecureStore.getItemAsync('auth_token') } catch { return null }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const tok = await getAuthToken();
        if (!tok) return;
        let meId: number | null = null;
        try {
          const meRes = await fetch(`${API_BASE_URL}/api/auth/mobile/me`, { headers: { Authorization: `Bearer ${tok}` } });
          if (meRes.ok) {
            const me = await meRes.json();
            meId = me?.user_id ?? null;
            if (mounted) setCurrentUserId(meId);
          }
        } catch {}
        const convRes = await fetch(`${API_BASE_URL}/api/mobile/conversations/${id}?include_messages=true`, { headers: { Authorization: `Bearer ${tok}` } });
        if (convRes.ok) {
          const c: ApiConversation = await convRes.json();
          if (mounted) {
            setConv(c);
            setChatOpen(c.status === 'open');
            let msgs: ApiMessage[] = [];
            if (Array.isArray(c.messages) && c.messages.length) {
              msgs = c.messages;
            } else {
              try {
                const mRes = await fetch(`${API_BASE_URL}/api/mobile/conversations/${id}/messages`, { headers: { Authorization: `Bearer ${tok}` } });
                if (mRes.ok) msgs = await mRes.json();
              } catch {}
            }
            const mapped: Msg[] = msgs.map((m) => {
              const createdAt = new Date(m.timestamp).getTime();
              const time = new Date(m.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
              const role: 'user' | 'ai' = meId && m.sender_id === meId ? 'user' : 'ai';
              const status: 'sent' | 'delivered' | 'read' | undefined = role === 'user' ? 'read' : undefined;
              return { id: String(m.message_id), role, text: m.content, time, createdAt, status };
            });
            setMessages(mapped);
          }
        }
        try {
          await fetch(`${API_BASE_URL}/api/mobile/conversations/${id}/read`, { method: 'POST', headers: { Authorization: `Bearer ${tok}` } });
        } catch {}
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false };
  }, [API_BASE_URL, getAuthToken, id]);

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
    const now = Date.now();
    const tm = new Date(now).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const tempId = `temp-${now}`;
    const userMsg: Msg = { id: tempId, role: 'user', text: trimmed, time: tm, createdAt: now, status: 'sent' };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    try {
      const tok = await getAuthToken();
      if (!tok || !conv) return;
      const res = await fetch(`${API_BASE_URL}/api/mobile/conversations/${conv.conversation_id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ content: trimmed, is_read: false }),
      });
      if (res.ok) {
        const m: ApiMessage = await res.json();
        const createdAt = new Date(m.timestamp).getTime();
        const time = new Date(m.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        setMessages((prev) => prev.map((x) => (x.id === tempId ? { id: String(m.message_id), role: 'user', text: m.content, time, createdAt, status: 'read' } : x)));
      }
    } catch {}
  };

  const toggleChat = async () => {
    await doHaptic('selection');
    const next = !chatOpen;
    setChatOpen(next);
    try {
      const tok = await getAuthToken();
      if (!tok || !conv) return;
      await fetch(`${API_BASE_URL}/api/mobile/conversations/${conv.conversation_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ status: next ? 'open' : 'ended' }),
      });
      setConv({ ...conv, status: next ? 'open' : 'ended' });
    } catch {}
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

  const TypingIndicator = ({ palette }: { palette: any }) => (
    <View style={{ paddingVertical: 8, paddingHorizontal: 12 }}>
      <View style={{ alignSelf: 'flex-start', backgroundColor: palette.background, borderColor: palette.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
        <ThemedText style={{ color: palette.muted }}>Typing...</ThemedText>
      </View>
    </View>
  );

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
