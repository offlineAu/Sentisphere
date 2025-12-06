import { StyleSheet, View, FlatList, TextInput, KeyboardAvoidingView, Platform, Pressable, TouchableOpacity, useWindowDimensions, Modal, ActivityIndicator, Animated, Easing, ScrollView, Alert } from 'react-native';
import { useState, useRef, useEffect, useCallback } from 'react';
import { ThemedText } from '@/components/themed-text';
import { GlobalScreenWrapper } from '@/components/GlobalScreenWrapper';
import { Icon } from '@/components/ui/icon';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { Card, CardContent } from '@/components/ui/card';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { conversationStore, ApiConversation } from '@/stores/conversationStore';
import { formatChatPreview, getTimestampMs } from '@/utils/time';

type Counselor = { user_id: number; name?: string | null; nickname?: string | null; email?: string | null };

export default function ChatScreen() {
  const scheme = useColorScheme() ?? 'light';
  const palette = Colors[scheme] as any;
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://sentisphere-production.up.railway.app';

  // Use store for conversations with subscription for reactivity
  const [conversations, setConversations] = useState<ApiConversation[]>(conversationStore.getConversations());
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(conversationStore.getIsLoading());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [counselors, setCounselors] = useState<Counselor[]>([]);
  const [cLoading, setCLoading] = useState(false);
  const [cSearch, setCSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  // Subscribe to store changes
  useEffect(() => {
    const unsubscribe = conversationStore.subscribe(() => {
      setConversations(conversationStore.getConversations());
      setLoading(conversationStore.getIsLoading());
    });
    return unsubscribe;
  }, []);

  // Entrance animations
  const entrance = useRef({
    header: new Animated.Value(0),
    title: new Animated.Value(0),
    content: new Animated.Value(0),
  }).current;

  const runEntrance = useCallback(() => {
    entrance.header.setValue(0);
    entrance.title.setValue(0);
    entrance.content.setValue(0);
    Animated.stagger(70, [
      Animated.timing(entrance.header, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(entrance.title, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(entrance.content, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  const makeFadeUp = (v: Animated.Value) => ({
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
  });

  useEffect(() => { runEntrance(); }, []);

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

  // Fetch conversations and sync with store
  const fetchConversations = useCallback(async () => {
    try {
      const tok = await getAuthToken();
      if (!tok) {
        conversationStore.setLoading(false);
        return;
      }
      try {
        const meRes = await fetch(`${API_BASE_URL}/api/auth/mobile/me`, {
          headers: { Authorization: `Bearer ${tok}` },
        });
        if (meRes.ok) {
          const me = await meRes.json();
          setCurrentUserId(me?.user_id ?? null);
        }
      } catch { }
      const res = await fetch(`${API_BASE_URL}/api/mobile/conversations?include_messages=true`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) {
        const data: ApiConversation[] = await res.json();
        conversationStore.setConversations(data);
      }
    } catch { }
    finally {
      conversationStore.setLoading(false);
    }
  }, [API_BASE_URL, getAuthToken]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Refresh on focus
  useFocusEffect(useCallback(() => {
    fetchConversations();
    runEntrance();
    return () => { };
  }, [fetchConversations]));

  const doHaptic = async (kind: 'light' | 'selection' | 'success' = 'light') => {
    if (Platform.OS === 'web') return;
    try {
      if (kind === 'success') return await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (kind === 'selection') return await Haptics.selectionAsync();
      return await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { }
  };

  const formatTime = (iso?: string | null) => {
    if (!iso) return '';
    return formatChatPreview(iso);
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
      const res = await fetch(`${API_BASE_URL}/api/mobile/counselors`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) {
        const data: Counselor[] = await res.json();
        setCounselors(data);
        console.log('Loaded counselors:', data);
      } else {
        console.error('Failed to load counselors:', res.status);
      }
    } catch (e) {
      console.error('Error loading counselors:', e);
    }
    finally { setCLoading(false); }
  };

  const createWithCounselor = async (c: Counselor) => {
    // Check for existing conversation with this counselor (prevent duplicates)
    const existing = conversations.find(
      conv => conv.counselor_id === c.user_id
    );
    if (existing) {
      setPickerOpen(false);
      await doHaptic('selection');
      router.push({
        pathname: '/(student)/(tabs)/chat/[id]',
        params: { id: String(existing.conversation_id), name: c.name || c.nickname || 'Counselor' }
      });
      return;
    }

    try {
      const tok = await getAuthToken();
      if (!tok) {
        console.error('No auth token');
        return;
      }

      // Ensure counselor_id is a valid number
      const counselorId = c.user_id;
      if (!counselorId || typeof counselorId !== 'number') {
        console.error('Invalid counselor_id:', counselorId, 'Full counselor object:', JSON.stringify(c));
        return;
      }

      const subject = c.name || c.nickname || c.email || 'Counselor';
      const requestBody = { subject, counselor_id: counselorId };

      console.log('=== Creating Conversation ===');
      console.log('Counselor selected:', JSON.stringify(c));
      console.log('Request body:', JSON.stringify(requestBody));

      const res = await fetch(`${API_BASE_URL}/api/mobile/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('Failed to create conversation:', res.status, errorText);
        return;
      }

      const convo: ApiConversation = await res.json();
      console.log('Created conversation response:', JSON.stringify(convo));
      console.log('Counselor ID in response:', convo.counselor_id);

      setPickerOpen(false);
      conversationStore.addConversation(convo);
      router.push({ pathname: '/(student)/(tabs)/chat/[id]', params: { id: String(convo.conversation_id), name: subject } });
    } catch (e) {
      console.error('Error creating conversation:', e);
    }
  };

  const deleteConversation = async (conversationId: number) => {
    const confirmDelete = () => {
      if (Platform.OS === 'web') {
        return window.confirm('This action will permanently remove this chat history. Continue?');
      }
      return new Promise<boolean>((resolve) => {
        Alert.alert(
          'Delete Conversation?',
          'This action will permanently remove this chat history. Continue?',
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
          ]
        );
      });
    };

    const confirmed = await confirmDelete();
    if (!confirmed) return;

    // Optimistic update - remove immediately from UI
    conversationStore.deleteConversation(conversationId);
    await doHaptic('success');

    // Then confirm with backend
    try {
      const tok = await getAuthToken();
      if (!tok) return;

      const res = await fetch(`${API_BASE_URL}/api/mobile/conversations/${conversationId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tok}` },
      });

      if (!res.ok) {
        // Revert on failure - refetch conversations
        console.error('Failed to delete conversation on backend, refetching...');
        fetchConversations();
      }
    } catch (e) {
      console.error('Error deleting conversation:', e);
      // Revert on error - refetch conversations
      fetchConversations();
    }
  };

  return (
    <GlobalScreenWrapper backgroundColor="#FFFFFF" topPadding={24}>
      <KeyboardAvoidingView style={{ flex: 1, paddingHorizontal: 16, backgroundColor: '#FFFFFF' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* Header with back and add buttons */}
        <Animated.View style={[styles.headerRow, makeFadeUp(entrance.header)]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back to dashboard"
            onPressIn={() => doHaptic('selection')}
            onPress={() => router.replace('/(student)/(tabs)/dashboard')}
            style={styles.headerButton}
          >
            <Icon name="chevron-left" size={24} color="#111827" />
          </Pressable>
          <View style={{ width: 40 }} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create conversation"
            onPressIn={() => doHaptic('selection')}
            onPress={handleCreate}
            style={styles.addButton}
          >
            <Icon name="plus" size={22} color="#0D8C4F" />
          </Pressable>
        </Animated.View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
          {/* Title section */}
          <Animated.View style={[styles.titleSection, makeFadeUp(entrance.title)]}>
            <Image source={require('@/assets/images/chatting.png')} style={styles.titleImage} contentFit="contain" />
            <ThemedText type="title" style={styles.pageTitle}>Chat</ThemedText>
            <ThemedText style={styles.pageSubtitle}>Connect with your counselor for support</ThemedText>
          </Animated.View>

          <Animated.View style={[styles.main, makeFadeUp(entrance.content)]}>
            <Card>
              <CardContent style={{ gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={[styles.iconPill, { backgroundColor: '#ECFDF5', borderColor: '#D1FAE5' }]}><Icon name="message-square" size={16} color="#0D8C4F" /></View>
                  <ThemedText type="subtitle" style={{ fontSize: 16, fontFamily: 'Inter_600SemiBold' }}>Conversations</ThemedText>
                </View>
                {(!loading && conversations.length === 0) && (
                  <View style={styles.emptyState}>
                    <Icon name="message-circle" size={32} color="#9CA3AF" />
                    <ThemedText style={styles.emptyText}>No conversations yet</ThemedText>
                    <Pressable
                      onPressIn={() => doHaptic('selection')}
                      onPress={handleCreate}
                      style={styles.startChatButton}
                    >
                      <Icon name="plus" size={18} color="#FFFFFF" />
                      <ThemedText style={styles.startChatButtonText}>Start a Conversation</ThemedText>
                    </Pressable>
                  </View>
                )}

                {conversations.map((c) => {
                  const msgs = c.messages || [];
                  // Sort messages by timestamp to ensure we get the latest
                  const sortedMsgs = [...msgs].sort((a, b) =>
                    getTimestampMs(a.timestamp) - getTimestampMs(b.timestamp)
                  );
                  const last = sortedMsgs.length > 0 ? sortedMsgs[sortedMsgs.length - 1] : undefined;
                  const hasUnread = currentUserId ? msgs.some((m) => !m.is_read && m.sender_id !== currentUserId) : false;
                  // Use counselor_name (live from user table) instead of subject (static from creation)
                  const name = c.counselor_name || c.subject || `Conversation #${c.conversation_id}`;
                  const isClosed = c.status === 'ended';

                  // Handle conversation press with optimistic read marking
                  const handleConversationPress = async () => {
                    // 1. Optimistic update - mark as read immediately in store
                    if (hasUnread) {
                      conversationStore.markConversationAsRead(c.conversation_id);
                    }

                    // 2. Navigate to conversation detail
                    router.push({ pathname: '/(student)/(tabs)/chat/[id]', params: { id: String(c.conversation_id), name } });

                    // 3. Backend will mark as read when conversation detail loads (existing behavior)
                  };

                  return (
                    <View key={c.conversation_id} style={styles.convItemWrapper}>
                      <Pressable
                        onPressIn={() => doHaptic('selection')}
                        onPress={handleConversationPress}
                        style={({ pressed }) => [
                          styles.convItem,
                          // Unread: elevated card with soft shadow and tinted background
                          hasUnread && !isClosed && styles.convItemUnread,
                          // Closed: muted red styling
                          isClosed && styles.convItemClosed,
                          // Read: clean minimal styling
                          !hasUnread && !isClosed && { backgroundColor: palette.background, borderColor: palette.border },
                          { opacity: pressed ? 0.96 : 1, flex: 1 }
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Open chat ${name}${hasUnread ? ', unread messages' : ''}`}
                      >
                        {/* Left accent bar for unread conversations */}
                        {hasUnread && !isClosed && <View style={styles.unreadAccent} />}

                        <View style={styles.convLeft}>
                          <View style={[
                            styles.avatar,
                            {
                              backgroundColor: isClosed ? '#9CA3AF' : (hasUnread ? '#0D8C4F' : '#111827'),
                              opacity: isClosed ? 0.8 : 1
                            }
                          ]}>
                            <ThemedText style={{ color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 15 }}>
                              {(name[0] || 'C').toString().toUpperCase()}
                            </ThemedText>
                          </View>
                          <View style={styles.convTextWrap}>
                            <ThemedText
                              style={{
                                fontFamily: hasUnread ? 'Inter_700Bold' : 'Inter_600SemiBold',
                                fontSize: 15,
                                color: isClosed ? '#6B7280' : (hasUnread ? '#111827' : '#374151'),
                                opacity: isClosed ? 0.8 : 1
                              }}
                              numberOfLines={1}
                            >
                              {name}
                            </ThemedText>
                            <ThemedText
                              style={{
                                color: isClosed ? '#DC2626' : (hasUnread ? '#4B5563' : '#6B7280'),
                                fontSize: 13,
                                fontFamily: isClosed ? 'Inter_500Medium' : (hasUnread ? 'Inter_500Medium' : undefined),
                                fontStyle: isClosed ? 'italic' : 'normal',
                              }}
                              numberOfLines={1}
                            >
                              {isClosed ? 'Conversation ended' : (last?.content || 'Start the conversation')}
                            </ThemedText>
                          </View>
                        </View>
                        <View style={styles.rightMeta}>
                          {isClosed ? (
                            // Closed conversation - show elegant delete button
                            // Using TouchableOpacity instead of Pressable to avoid nested <button> on web
                            <TouchableOpacity
                              onPressIn={() => doHaptic('selection')}
                              onPress={(e) => {
                                e.stopPropagation();
                                deleteConversation(c.conversation_id);
                              }}
                              style={styles.deleteButtonInline}
                              activeOpacity={0.7}
                              accessibilityRole="button"
                              accessibilityLabel="Delete conversation"
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Icon name="trash-2" size={16} color="#EF4444" />
                            </TouchableOpacity>
                          ) : (
                            <>
                              {last?.timestamp && (
                                <ThemedText style={{
                                  color: hasUnread ? '#0D8C4F' : '#9CA3AF',
                                  fontSize: 12,
                                  fontFamily: hasUnread ? 'Inter_600SemiBold' : 'Inter_500Medium'
                                }}>
                                  {formatTime(last.timestamp)}
                                </ThemedText>
                              )}
                              {hasUnread && (
                                <View style={styles.unreadBadge}>
                                  <View style={styles.unreadDot} />
                                </View>
                              )}
                            </>
                          )}
                        </View>
                      </Pressable>
                    </View>
                  );
                })}
              </CardContent>
            </Card>
          </Animated.View>
        </ScrollView>
        {/* Counselor picker modal */}
        <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
          <Pressable style={styles.overlay} onPress={() => setPickerOpen(false)}>
            <Pressable style={[styles.sheet, { backgroundColor: palette.background, borderColor: palette.border }]} onPress={(e) => e.stopPropagation()}>
              <View style={styles.sheetHeader}>
                <ThemedText type="subtitle" style={{ fontSize: 20, fontFamily: 'Inter_700Bold', textAlign: 'center' }}>Start a Conversation</ThemedText>
                <ThemedText style={{ color: palette.muted, marginTop: 6, textAlign: 'center', fontSize: 14 }}>Choose a counselor to connect with</ThemedText>
                <View style={[styles.searchBar, { borderColor: searchFocused ? '#0D8C4F' : palette.border, borderWidth: searchFocused ? 1.5 : 1, backgroundColor: palette.background }]}>
                  <Icon name="search" size={16} color={searchFocused ? '#0D8C4F' : palette.muted} />
                  <TextInput
                    placeholder="Search counselor by name or email"
                    placeholderTextColor={palette.muted}
                    value={cSearch}
                    onChangeText={setCSearch}
                    // @ts-ignore - web outline
                    style={{ flex: 1, padding: 6, color: palette.text, outlineStyle: 'none' }}
                    selectionColor="#0D8C4F"
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
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
              <View style={{ paddingTop: 12 }}>
                <Pressable onPress={() => setPickerOpen(false)} style={styles.cancelButton}>
                  <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
    </GlobalScreenWrapper>
  );
}

const styles = StyleSheet.create({
  // Layout
  container: { flex: 1 },
  main: { flex: 1, paddingHorizontal: 0, paddingBottom: 16 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 0,
    paddingVertical: 12,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: '#374151',
    marginTop: 4,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  startChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0D8C4F',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 50,
    marginTop: 12,
  },
  startChatButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  cancelButton: {
    backgroundColor: '#F3F4F6',
    paddingVertical: 12,
    borderRadius: 50,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#374151',
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  titleSection: {
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 20,
  },
  titleIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },
  titleImage: {
    width: 56,
    height: 56,
  },
  pageTitle: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    color: '#111827',
    textAlign: 'center',
  },
  pageSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    maxWidth: 280,
  },
  // Conversation item
  convItemWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  convItem: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  // Unread conversation: elevated card with soft shadow
  convItemUnread: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  // Closed conversation: muted red styling
  convItemClosed: {
    backgroundColor: '#FCECEC',
    borderColor: '#FECACA',
  },
  // Left accent bar for unread
  unreadAccent: {
    width: 3,
    height: '80%',
    backgroundColor: '#10B981',
    borderRadius: 2,
    position: 'absolute',
    left: 0,
    top: '10%',
  },
  deleteButtonInline: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  convLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  convTextWrap: { flex: 1, minWidth: 0, gap: 3 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightMeta: { alignItems: 'flex-end', gap: 6, flexShrink: 0, marginLeft: 8 },
  // Unread badge container with subtle background
  unreadBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981', // Sentisphere green
  },
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
  sheetHeader: { paddingHorizontal: 8, paddingTop: 8, paddingBottom: 16, alignItems: 'center' },
  searchBar: { marginTop: 12, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8, width: '100%' },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10 },
});
