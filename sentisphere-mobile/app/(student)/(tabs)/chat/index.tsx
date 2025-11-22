import { StyleSheet, View, FlatList, TextInput, KeyboardAvoidingView, Platform, Pressable, useWindowDimensions, Modal, ActivityIndicator } from 'react-native';
import { useState, useRef, useEffect, useCallback } from 'react';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/ui/icon';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { Card, CardContent } from '@/components/ui/card';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Msg = { id: string; role: 'user' | 'ai'; text: string; time: string };

const initialMessages: Msg[] = [
  { id: 'm1', role: 'ai', text: "Thanks for sharing, Mark. Let's try breaking tasks into smaller steps.", time: '03:38 AM' },
  { id: 'm2', role: 'user', text: "Yes, I'll try that out this week!", time: '04:38 AM' },
  { id: 'm3', role: 'ai', text: 'Yes, Do that!', time: '12:11 PM' },
];

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

type Counselor = { user_id: number; name?: string | null; nickname?: string | null; email?: string | null };

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
  const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:8010';
  const [conversations, setConversations] = useState<ApiConversation[]>([]);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [counselors, setCounselors] = useState<Counselor[]>([]);
  const [cLoading, setCLoading] = useState(false);
  const [cSearch, setCSearch] = useState('');

  useEffect(() => {
    // intentionally no health probe to avoid logging unrelated web DB status
  }, []);

  const getAuthToken = useCallback(async (): Promise<string | null> => {
    if (Platform.OS === 'web') {
      try {
        // @ts-ignore
        return (window as any)?.localStorage?.getItem('auth_token') || null;
      } catch {
        return null;
      }
    }
    try {
      return await SecureStore.getItemAsync('auth_token');
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const tok = await getAuthToken();
        if (!tok) {
          setLoading(false);
          return;
        }
        try {
          const meRes = await fetch(`${API_BASE_URL}/api/auth/mobile/me`, {
            headers: { Authorization: `Bearer ${tok}` },
          });
          if (meRes.ok) {
            const me = await meRes.json();
            if (mounted) setCurrentUserId(me?.user_id ?? null);
          }
        } catch {}
        const res = await fetch(`${API_BASE_URL}/api/mobile/conversations?include_messages=true`, {
          headers: { Authorization: `Bearer ${tok}` },
        });
        if (res.ok) {
          const data: ApiConversation[] = await res.json();
          if (mounted) setConversations(data);
        }
      } catch {}
      finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [API_BASE_URL, getAuthToken]);

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

  const formatTime = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) {
      return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString();
  };

  const handleCreate = async () => {
    await doHaptic('selection');
    setPickerOpen(true);
    if (counselors.length === 0) {
      await loadCounselors();
    }
  };

  const loadCounselors = async () => {
    setCLoading(true);
    try {
      const tok = await getAuthToken();
      if (!tok) return;
      const res = await fetch(`${API_BASE_URL}/api/counselors`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) {
        const data: Counselor[] = await res.json();
        setCounselors(data);
      }
    } catch {}
    finally { setCLoading(false); }
  };

  const createWithCounselor = async (c: Counselor) => {
    try {
      const tok = await getAuthToken();
      if (!tok) return;
      const subject = `Counselor: ${c.nickname || c.name || c.email || 'Chat'}`;
      const res = await fetch(`${API_BASE_URL}/api/mobile/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ subject }),
      });
      if (!res.ok) return;
      const convo: ApiConversation = await res.json();
      setPickerOpen(false);
      setConversations((prev) => [convo, ...prev]);
      router.push({ pathname: '/(student)/(tabs)/chat/[id]', params: { id: String(convo.conversation_id), name: subject } });
    } catch {}
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
      <ThemedView style={[styles.container, { paddingTop: insets.top + 24, paddingHorizontal: 16 }]}> 
        <View style={{ width: '100%', gap: 6, marginBottom: 12 }}>
          <View style={styles.headerRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back to dashboard"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              onPressIn={() => doHaptic('selection')}
              onPress={() => router.replace('/(student)/(tabs)/dashboard')}
              style={({ pressed }) => [
                styles.backButton,
                {
                  backgroundColor: palette.background,
                  borderColor: palette.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Icon name="arrow-left" size={22} color={palette.text} />
            </Pressable>
            <View style={styles.headerCenter}>
              <View style={[styles.headerIcon, { backgroundColor: palette.background, borderColor: palette.border }]}><Icon name="message-square" size={18} color={palette.tint} /></View>
              <ThemedText type="subtitle" style={{ fontSize: 20 }}>Chat</ThemedText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create conversation"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              onPressIn={() => doHaptic('selection')}
              onPress={handleCreate}
              style={({ pressed }) => [
                styles.backButton,
                {
                  backgroundColor: palette.background,
                  borderColor: palette.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Icon name="plus" size={22} color={palette.text} />
            </Pressable>
          </View>
          <ThemedText style={{ color: palette.muted, fontSize: 13, textAlign: 'center', alignSelf: 'center' }}>Manage and respond to student concerns</ThemedText>
        </View>

        <View style={styles.main}>
          <Card>
            <CardContent style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.iconPill, { backgroundColor: palette.background, borderColor: palette.border }]}><Icon name="message-square" size={16} color={palette.tint} /></View>
                <ThemedText type="subtitle" style={{ fontSize: 16 }}>Conversations</ThemedText>
              </View>
              {(!loading && conversations.length === 0) && (
                <ThemedText style={{ color: palette.muted, fontSize: 14, textAlign: 'center', paddingVertical: 8 }}>there is no converstations</ThemedText>
              )}

              {conversations.map((c) => {
                const msgs = c.messages || [];
                const last = msgs.length > 0 ? msgs[msgs.length - 1] : undefined;
                const unreadCount = currentUserId ? msgs.filter((m) => !m.is_read && m.sender_id !== currentUserId).length : 0;
                const name = c.subject || `Conversation #${c.conversation_id}`;
                return (
                  <Pressable
                    key={c.conversation_id}
                    onPressIn={() => doHaptic('selection')}
                    onPress={() => router.push({ pathname: '/(student)/(tabs)/chat/[id]', params: { id: String(c.conversation_id), name } })}
                    style={({ pressed }) => [styles.convItem, { backgroundColor: palette.background, borderColor: palette.border, opacity: pressed ? 0.96 : 1 }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Open chat ${name}`}
                  >
                    <View style={styles.convLeft}>
                      <View style={[styles.avatar, { backgroundColor: palette.primary }]}><ThemedText style={{ color: '#FFFFFF', fontFamily: 'Inter_700Bold' }}>{(name[0] || 'C').toString().toUpperCase()}</ThemedText></View>
                      <View style={{ gap: 2, maxWidth: '72%' }}>
                        <ThemedText style={{ fontFamily: 'Inter_600SemiBold' }} numberOfLines={1}>{name}</ThemedText>
                        <ThemedText style={{ color: palette.muted, fontSize: 12 }} numberOfLines={1}>{last?.content || 'No messages yet'}</ThemedText>
                      </View>
                    </View>
                    <View style={styles.rightMeta}>
                      <ThemedText style={{ color: palette.muted, fontSize: 12 }}>{formatTime(last?.timestamp || c.last_activity_at)}</ThemedText>
                      {unreadCount > 0 && (
                        <View style={[styles.unreadBadge, { backgroundColor: palette.tint }]}>
                          <ThemedText style={{ color: '#FFFFFF', fontSize: 11, fontFamily: 'Inter_600SemiBold' }}>{unreadCount}</ThemedText>
                        </View>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </CardContent>
          </Card>
        </View>
        {/* Counselor picker modal */}
        <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
          <Pressable style={styles.overlay} onPress={() => setPickerOpen(false)}>
            <Pressable style={[styles.sheet, { backgroundColor: palette.background, borderColor: palette.border }]} onPress={(e) => e.stopPropagation()}>
              <View style={styles.sheetHeader}>
                <ThemedText type="subtitle" style={{ fontSize: 18 }}>Start a conversation</ThemedText>
                <ThemedText style={{ color: palette.muted, marginTop: 2 }}>Choose a counselor</ThemedText>
                <View style={[styles.searchBar, { borderColor: palette.border, backgroundColor: palette.background }]}>
                  <Icon name="search" size={16} color={palette.muted} />
                  <TextInput
                    placeholder="Search counselor by name or email"
                    placeholderTextColor={palette.muted}
                    value={cSearch}
                    onChangeText={setCSearch}
                    style={{ flex: 1, padding: 6, color: palette.text }}
                    autoFocus
                  />
                  <Pressable accessibilityRole="button" onPress={loadCounselors} style={({ pressed }) => ({ padding: 6, borderRadius: 8, opacity: pressed ? 0.6 : 1 })}>
                    <Icon name="refresh-ccw" size={18} color={palette.icon} />
                  </Pressable>
                </View>
              </View>
              {cLoading ? (
                <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                  <ActivityIndicator />
                </View>
              ) : (
                <FlatList
                  data={counselors.filter((x) => {
                    const q = cSearch.trim().toLowerCase();
                    if (!q) return true;
                    const nm = (x.name || '').toLowerCase();
                    const nn = (x.nickname || '').toLowerCase();
                    const em = (x.email || '').toLowerCase();
                    return nm.includes(q) || nn.includes(q) || em.includes(q);
                  })}
                  keyExtractor={(it) => String(it.user_id)}
                  ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                  contentContainerStyle={{ paddingVertical: 8 }}
                  renderItem={({ item }) => {
                    const label = item.nickname || item.name || item.email || `Counselor #${item.user_id}`;
                    const letter = (label[0] || 'C').toString().toUpperCase();
                    return (
                      <Pressable
                        onPressIn={() => doHaptic('selection')}
                        onPress={() => createWithCounselor(item)}
                        style={({ pressed }) => [styles.userRow, { backgroundColor: palette.background, borderColor: palette.border, opacity: pressed ? 0.95 : 1 }]}
                      >
                        <View style={[styles.avatar, { backgroundColor: palette.primary }]}><ThemedText style={{ color: '#FFFFFF', fontFamily: 'Inter_700Bold' }}>{letter}</ThemedText></View>
                        <View style={{ flex: 1 }}>
                          <ThemedText style={{ fontFamily: 'Inter_600SemiBold' }} numberOfLines={1}>{label}</ThemedText>
                          <ThemedText style={{ color: palette.muted, fontSize: 12 }} numberOfLines={1}>{item.email || '—'}</ThemedText>
                        </View>
                        <Icon name="chevron-right" size={18} color={palette.icon} />
                      </Pressable>
                    );
                  }}
                />
              )}
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingTop: 8 }}>
                <Pressable onPress={() => setPickerOpen(false)} style={({ pressed }) => [styles.cancelBtn, { borderColor: palette.border, backgroundColor: palette.background, opacity: pressed ? 0.8 : 1 }]}>
                  <ThemedText>Cancel</ThemedText>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  // Layout
  container: { flex: 1 },
  main: { flex: 1, paddingHorizontal: 0, paddingBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'space-between' },
  headerIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  backButton: {
    borderWidth: 1,
    borderRadius: 12,
    width: 42,
    height: 42,
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'center' },
  backButtonPlaceholder: { width: 42, height: 42 },
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

  // Picker modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 520, borderRadius: 16, borderWidth: 1, padding: 14, maxHeight: '80%' },
  sheetHeader: { paddingHorizontal: 6, paddingBottom: 8 },
  searchBar: { marginTop: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 8 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10 },
  cancelBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },

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
