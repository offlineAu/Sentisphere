import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { StyleSheet, View, FlatList, TextInput, KeyboardAvoidingView, Platform, Pressable, useWindowDimensions, Alert, type AlertButton, Animated, Easing, ActivityIndicator, Keyboard } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { GlobalScreenWrapper } from '@/components/GlobalScreenWrapper';
import { Icon } from '@/components/ui/icon';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import * as Haptics from 'expo-haptics';
import * as SecureStore from 'expo-secure-store';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { conversationStore } from '@/stores/conversationStore';
import { formatChatTime, formatDateLabel, getTimestampMs, getCurrentChatTime } from '@/utils/time';

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
  counselor_id?: number | null;
  counselor_name?: string | null;
  counselor_email?: string | null;
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
  const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://sentisphere-production.up.railway.app';
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [conv, setConv] = useState<ApiConversation | null>(null);
  // Display name: prefer live counselor_name from API, fallback to route param
  const displayName = conv?.counselor_name || conv?.subject || name || 'Counselor';
  const wsRef = useRef<WebSocket | null>(null);
  
  // Track which messages should animate (only newly sent/received, not on page load)
  const animatedMessageIds = useRef<Set<string>>(new Set());
  const isInitialLoad = useRef(true);
  
  // Polling refs
  const lastMessageIdRef = useRef<string | null>(null);
  const isFetchingRef = useRef(false);
  const isAuthValidRef = useRef(true); // Track if auth is valid to prevent spam on 401

  // Entrance animations
  const entrance = useRef({
    header: new Animated.Value(0),
    messages: new Animated.Value(0),
    input: new Animated.Value(0),
  }).current;

  const runEntrance = useCallback(() => {
    entrance.header.setValue(0);
    entrance.messages.setValue(0);
    entrance.input.setValue(0);
    Animated.stagger(80, [
      Animated.timing(entrance.header, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(entrance.messages, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(entrance.input, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  const makeFadeUp = (v: Animated.Value) => ({
    opacity: v,
    transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
  });

  useEffect(() => { runEntrance(); }, []);

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

  // Clear state immediately when conversation ID changes (prevents showing old data)
  useEffect(() => {
    setMessages([]);
    setConv(null);
    setLoading(true);
    // Clear animation tracking for new conversation
    animatedMessageIds.current.clear();
    isInitialLoad.current = true;
    // Reset auth flag for new conversation
    isAuthValidRef.current = true;
  }, [id]);

  // Fetch conversation and messages - optimized for speed
  const fetchConversation = useCallback(async (isInitial = false) => {
    if (isInitial) {
      setLoading(true);
      setMessages([]); // Clear immediately to prevent flash of old content
    }
    
    try {
      const tok = await getAuthToken();
      if (!tok) return;
      
      // Fetch user ID and conversation in parallel for speed
      let meId: number | null = currentUserId;
      const convPromise = fetch(`${API_BASE_URL}/api/mobile/conversations/${id}?include_messages=true`, { 
        headers: { Authorization: `Bearer ${tok}` },
        cache: 'no-store',
      });
      
      if (!meId) {
        try {
          const meRes = await fetch(`${API_BASE_URL}/api/auth/mobile/me`, { headers: { Authorization: `Bearer ${tok}` } });
          if (meRes.ok) {
            const me = await meRes.json();
            meId = me?.user_id ?? null;
            setCurrentUserId(meId);
          }
        } catch {}
      }
      
      const convRes = await convPromise;
      if (convRes.ok) {
        const c: ApiConversation = await convRes.json();
        setConv(c);
        setChatOpen(c.status === 'open');
        
        // Process messages
        const msgs: ApiMessage[] = Array.isArray(c.messages) ? c.messages : [];
        const mapped: Msg[] = msgs.map((m) => {
          const createdAt = getTimestampMs(m.timestamp);
          const time = formatChatTime(m.timestamp);
          const role: 'user' | 'ai' = meId && m.sender_id === meId ? 'user' : 'ai';
          const status: 'sent' | 'delivered' | 'read' | undefined = role === 'user' ? 'read' : undefined;
          return { id: String(m.message_id), role, text: m.content, time, createdAt, status };
        });
        setMessages(mapped);
        
        // Mark initial load complete (no animations for existing messages)
        isInitialLoad.current = false;
        
        // Mark as read (fire and forget)
        fetch(`${API_BASE_URL}/api/mobile/conversations/${id}/read`, { 
          method: 'POST', 
          headers: { Authorization: `Bearer ${tok}` } 
        }).catch(() => {});
      }
    } finally {
      setLoading(false);
    }
  }, [API_BASE_URL, getAuthToken, id, currentUserId]);

  // Fetch on mount
  useEffect(() => { fetchConversation(true); }, [id]);
  
  // Refresh on focus (when navigating back to this screen) - don't clear messages
  useFocusEffect(useCallback(() => {
    // Reset auth flag on focus in case user re-authenticated
    isAuthValidRef.current = true;
    fetchConversation(false);
    runEntrance();
    return () => {};
  }, [fetchConversation, runEntrance]));
  
  const fetchNewMessages = useCallback(async () => {
    // Skip if auth is invalid, chat is closed, or already fetching
    if (!isAuthValidRef.current || !chatOpen || isFetchingRef.current) return;
    isFetchingRef.current = true;
    
    try {
      const tok = await getAuthToken();
      if (!tok || !conv) {
        isAuthValidRef.current = false;
        return;
      }
      
      const mRes = await fetch(`${API_BASE_URL}/api/mobile/conversations/${id}/messages`, { 
        headers: { Authorization: `Bearer ${tok}` },
        cache: 'no-store',
      });
      
      // Stop polling on auth errors
      if (mRes.status === 401 || mRes.status === 403) {
        isAuthValidRef.current = false;
        return;
      }
      
      if (!mRes.ok) return;
      
      const msgs: ApiMessage[] = await mRes.json();
      if (!msgs.length) return;
      
      // Get the latest message ID from fetched messages
      const latestMsgId = String(msgs[msgs.length - 1].message_id);
      
      // Only update if there are new messages
      if (lastMessageIdRef.current !== latestMsgId) {
        lastMessageIdRef.current = latestMsgId;
        
        setMessages((prev) => {
          const prevIds = new Set(prev.map(p => p.id));
          const newMsgs: Msg[] = [];
          
          // Only add truly new messages
          for (const m of msgs) {
            const msgId = String(m.message_id);
            if (!prevIds.has(msgId)) {
              const createdAt = getTimestampMs(m.timestamp);
              const time = formatChatTime(m.timestamp);
              const role: 'user' | 'ai' = currentUserId && m.sender_id === currentUserId ? 'user' : 'ai';
              const status: 'sent' | 'delivered' | 'read' | undefined = role === 'user' ? 'read' : undefined;
              newMsgs.push({ id: msgId, role, text: m.content, time, createdAt, status });
              // Mark new incoming messages for animation
              animatedMessageIds.current.add(msgId);
            }
          }
          
          if (newMsgs.length > 0) {
            // Play haptic for new incoming messages (not from user)
            const newOthers = newMsgs.filter(m => m.role === 'ai');
            if (newOthers.length > 0) {
              doHaptic('light');
            }
            // Scroll to bottom
            requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
            return [...prev, ...newMsgs];
          }
          return prev;
        });
        
        // Mark messages as read (fire and forget)
        fetch(`${API_BASE_URL}/api/mobile/conversations/${id}/read`, { 
          method: 'POST', 
          headers: { Authorization: `Bearer ${tok}` } 
        }).catch(() => {});
      }
    } catch {} finally {
      isFetchingRef.current = false;
    }
  }, [API_BASE_URL, getAuthToken, id, conv, chatOpen, currentUserId]);

  // Set up fast polling interval
  useEffect(() => {
    if (!conv || loading) return;
    
    // Update lastMessageIdRef with current latest message
    if (messages.length > 0) {
      lastMessageIdRef.current = messages[messages.length - 1].id;
    }
    
    // Poll every 1 second for fast updates
    const interval = setInterval(fetchNewMessages, 1000);
    return () => clearInterval(interval);
  }, [conv, loading, fetchNewMessages, messages.length]);

  // WebSocket for real-time updates
  useEffect(() => {
    if (!conv || !id) return;
    
    const connectWebSocket = async () => {
      try {
        const tok = await getAuthToken();
        if (!tok) return;
        
        // Construct WebSocket URL
        const wsProtocol = API_BASE_URL.startsWith('https') ? 'wss' : 'ws';
        const wsHost = API_BASE_URL.replace(/^https?:\/\//, '');
        const wsUrl = `${wsProtocol}://${wsHost}/ws/chat/${id}?token=${tok}`;
        
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        
        ws.onopen = () => {
          console.log('WebSocket connected for conversation', id);
        };
        
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // Handle conversation status updates
            if (data.type === 'status_update') {
              const newStatus = data.status;
              setChatOpen(newStatus === 'open');
              setConv((prev) => prev ? { ...prev, status: newStatus } : prev);
              if (newStatus === 'ended') {
                doHaptic('selection');
              }
            }
            
            // Handle new messages
            if (data.type === 'new_message' && data.message) {
              const m = data.message as ApiMessage;
              const msgId = String(m.message_id);
              const role: 'user' | 'ai' = m.sender_id === currentUserId ? 'user' : 'ai';
              const createdAt = getTimestampMs(m.timestamp);
              const time = formatChatTime(m.timestamp);
              const newMsg: Msg = { id: msgId, role, text: m.content, time, createdAt, status: 'read' };
              
              setMessages((prev) => {
                // Avoid duplicates
                if (prev.some((x) => x.id === newMsg.id)) return prev;
                // Mark for animation
                animatedMessageIds.current.add(msgId);
                return [...prev, newMsg];
              });
              
              // Auto-scroll to bottom
              requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
            }
          } catch (e) {
            console.log('WebSocket message parse error:', e);
          }
        };
        
        ws.onerror = (error) => {
          console.log('WebSocket error:', error);
        };
        
        ws.onclose = () => {
          console.log('WebSocket disconnected');
        };
      } catch (e) {
        console.log('WebSocket connection error:', e);
      }
    };
    
    connectWebSocket();
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [conv, id, API_BASE_URL, getAuthToken, currentUserId]);

  // Scroll to bottom when keyboard opens (iOS and Android) with smooth animation
  useEffect(() => {
    const keyboardShowEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    
    const keyboardShowListener = Keyboard.addListener(keyboardShowEvent, (e) => {
      // Use appropriate delay based on platform
      // iOS: shorter delay since we use keyboardWillShow
      // Android: slightly longer to wait for keyboard animation
      const delay = Platform.OS === 'ios' ? 50 : 150;
      
      setTimeout(() => {
        // Use requestAnimationFrame for smoother scroll timing
        requestAnimationFrame(() => {
          listRef.current?.scrollToEnd({ animated: true });
        });
      }, delay);
    });
    
    return () => {
      keyboardShowListener.remove();
    };
  }, []);

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
    const tm = getCurrentChatTime();
    const tempId = `temp-${now}`;
    
    // Mark this message for animation
    animatedMessageIds.current.add(tempId);
    
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
        const createdAt = getTimestampMs(m.timestamp);
        const time = formatChatTime(m.timestamp);
        const newId = String(m.message_id);
        // Transfer animation flag to new ID
        animatedMessageIds.current.delete(tempId);
        animatedMessageIds.current.add(newId);
        setMessages((prev) => prev.map((x) => (x.id === tempId ? { id: newId, role: 'user', text: m.content, time, createdAt, status: 'read' } : x)));
      }
    } catch {}
  };

  const toggleChat = async () => {
    await doHaptic('selection');
    const next = !chatOpen;
    const newStatus = next ? 'open' : 'ended';
    
    // Optimistic update - update UI immediately
    setChatOpen(next);
    setConv((prev) => prev ? { ...prev, status: newStatus } : prev);
    
    // Update global store for immediate sync with conversation list
    if (conv) {
      if (next) {
        conversationStore.reopenConversation(conv.conversation_id);
      } else {
        conversationStore.closeConversation(conv.conversation_id);
      }
    }
    
    // Then sync with backend
    try {
      const tok = await getAuthToken();
      if (!tok || !conv) return;
      
      const requestBody = { status: newStatus };
      console.log('[toggleChat] Updating conversation:', conv.conversation_id, 'to status:', newStatus);
      
      const res = await fetch(`${API_BASE_URL}/api/mobile/conversations/${conv.conversation_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify(requestBody),
      });
      
      if (!res.ok) {
        // Log the error response
        const errorText = await res.text();
        console.error('Failed to update conversation status:', res.status, errorText);
        
        // Revert on failure
        setChatOpen(!next);
        setConv((prev) => prev ? { ...prev, status: next ? 'ended' : 'open' } : prev);
        if (conv) {
          if (next) {
            conversationStore.closeConversation(conv.conversation_id);
          } else {
            conversationStore.reopenConversation(conv.conversation_id);
          }
        }
      } else {
        console.log('[toggleChat] Successfully updated conversation status');
      }
    } catch (e) {
      console.error('Error toggling chat status:', e);
      // Revert on error
      setChatOpen(!next);
      setConv((prev) => prev ? { ...prev, status: next ? 'ended' : 'open' } : prev);
    }
  };

  const StatusBadge = ({ open }: { open: boolean }) => (
    <View style={[styles.badge, open ? { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' } : { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: open ? '#0D8C4F' : '#DC2626' }} />
        <ThemedText style={[styles.badgeText, { color: open ? '#0D8C4F' : '#DC2626' }]}>{open ? 'Open' : 'Closed'}</ThemedText>
      </View>
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

  const LoadingIndicator = () => (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#0D8C4F" />
      <ThemedText style={styles.loadingText}>Loading conversation...</ThemedText>
    </View>
  );

  const TypingIndicator = ({ palette }: { palette: any }) => (
    <View style={{ paddingVertical: 8, paddingHorizontal: 12 }}>
      <View style={{ alignSelf: 'flex-start', backgroundColor: palette.background, borderColor: palette.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
        <ThemedText style={{ color: palette.muted }}>Typing...</ThemedText>
      </View>
    </View>
  );

  const WelcomeMessage = () => {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0.9)).current;
    const translateAnim = useRef(new Animated.Value(0)).current;
    const hasAnimatedIn = useRef(false);
    const [hidden, setHidden] = useState(false);
    
    // Single effect to handle all animation states
    useEffect(() => {
      // Initial entrance animation (only once)
      if (!hasAnimatedIn.current && !inputFocused) {
        hasAnimatedIn.current = true;
        Animated.parallel([
          Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.spring(scaleAnim, { toValue: 1, friction: 8, tension: 40, useNativeDriver: true }),
        ]).start();
        return;
      }
      
      // Exit animation when input is focused
      if (inputFocused && hasAnimatedIn.current) {
        Animated.parallel([
          Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
          Animated.timing(scaleAnim, { toValue: 0.95, duration: 200, useNativeDriver: true }),
          Animated.timing(translateAnim, { toValue: -20, duration: 200, useNativeDriver: true }),
        ]).start(() => setHidden(true));
      }
      
      // Re-entrance animation when keyboard closes
      if (!inputFocused && hidden) {
        setHidden(false);
        fadeAnim.setValue(0);
        scaleAnim.setValue(0.95);
        translateAnim.setValue(15);
        Animated.parallel([
          Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
          Animated.timing(scaleAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
          Animated.timing(translateAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
        ]).start();
      }
    }, [inputFocused, hidden]);
    
    if (hidden) return null;
    
    return (
      <Animated.View style={[
        styles.welcomeContainer, 
        { 
          opacity: fadeAnim, 
          transform: [
            { scale: scaleAnim },
            { translateY: translateAnim }
          ] 
        }
      ]}>
        {/* Decorative background circles */}
        <View style={styles.welcomeDecorOuter}>
          <View style={styles.welcomeDecorMiddle}>
            <View style={styles.welcomeIconWrap}>
              <Icon name="message-circle" size={28} color="#0D8C4F" />
            </View>
          </View>
        </View>
        
        {/* Text content */}
        <ThemedText style={styles.welcomeTitle}>Start a Conversation</ThemedText>
        <ThemedText style={styles.welcomeName}>{displayName || 'Your Counselor'}</ThemedText>
        <ThemedText style={styles.welcomeText}>
          Share what's on your mind. Your counselor is here to listen and support you.
        </ThemedText>
        
        {/* Trust badges */}
        <View style={styles.welcomeBadges}>
          <View style={styles.welcomeBadge}>
            <Icon name="check-circle" size={14} color="#0D8C4F" />
            <ThemedText style={styles.welcomeBadgeText}>Private</ThemedText>
          </View>
          <View style={styles.welcomeBadgeDivider} />
          <View style={styles.welcomeBadge}>
            <Icon name="check-circle" size={14} color="#0D8C4F" />
            <ThemedText style={styles.welcomeBadgeText}>Confidential</ThemedText>
          </View>
          <View style={styles.welcomeBadgeDivider} />
          <View style={styles.welcomeBadge}>
            <Icon name="check-circle" size={14} color="#0D8C4F" />
            <ThemedText style={styles.welcomeBadgeText}>Secure</ThemedText>
          </View>
        </View>
        
        {/* Hint */}
        <View style={styles.welcomeHint}>
          <Icon name="arrow-right" size={14} color="#9CA3AF" />
          <ThemedText style={styles.welcomeHintText}>Type a message below to begin</ThemedText>
        </View>
      </Animated.View>
    );
  };

  // Message bubble - animates only once when first mounted if marked for animation
  const AnimatedBubble = ({ m, isUser, shouldAnimate }: { m: Msg; isUser: boolean; shouldAnimate: boolean }) => {
    // Capture initial animation state ONCE on mount - never changes after
    const shouldAnimateOnMount = useRef(shouldAnimate).current;
    const animValue = useRef(new Animated.Value(shouldAnimateOnMount ? 0 : 1)).current;
    
    useEffect(() => {
      if (shouldAnimateOnMount) {
        // Remove from animation set immediately so re-renders don't re-trigger
        animatedMessageIds.current.delete(m.id);
        
        // Run the animation once
        Animated.spring(animValue, {
          toValue: 1,
          friction: 8,
          tension: 100,
          useNativeDriver: true,
        }).start();
      }
    }, []); // Empty deps - only run once on mount
    
    const statusMarks = isUser ? (m.status === 'read' ? '✓✓' : m.status === 'delivered' ? '✓✓' : '✓') : '';
    const statusColor = isUser ? (m.status === 'read' ? palette.tint : palette.muted) : palette.muted;
    
    return (
      <Animated.View style={[
        styles.row, 
        { justifyContent: isUser ? 'flex-end' : 'flex-start' },
        shouldAnimateOnMount && {
          opacity: animValue,
          transform: [
            { scale: animValue.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) },
            { translateY: animValue.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }
          ]
        }
      ]}>
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
      </Animated.View>
    );
  };

  const renderRow = ({ item }: { item: any }) => {
    if (item.type === 'sep') {
      return (
        <View style={styles.sepContainer}>
          <View style={styles.sepLine} />
          <View style={styles.sepWrap}>
            <Icon name="calendar" size={12} color="#0D8C4F" />
            <ThemedText style={styles.sepText}>{item.label}</ThemedText>
          </View>
          <View style={styles.sepLine} />
        </View>
      );
    }
    const m: Msg = item as Msg;
    const isUser = m.role === 'user';
    // Only animate if this message is marked for animation
    const shouldAnimate = animatedMessageIds.current.has(m.id);
    return <AnimatedBubble m={m} isUser={isUser} shouldAnimate={shouldAnimate} />;
  };

  return (
    <GlobalScreenWrapper backgroundColor={palette.background}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: palette.background }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Stack.Screen options={{ title: (name as string) || 'Chat' }} />
        {/* In-app header - Fixed layout to ensure status badge is always visible */}
        <Animated.View style={[styles.chatHeader, { backgroundColor: palette.background, borderBottomColor: palette.border }, makeFadeUp(entrance.header)]}>
          <View style={styles.headerLeft}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              onPressIn={() => { if (Platform.OS !== 'web') { try { Haptics.selectionAsync() } catch {} } }}
              onPress={() => router.replace('/(student)/(tabs)/chat')}
              style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.8 : 1 }]}
            >
              <Icon name="chevron-left" size={20} color="#111827" />
            </Pressable>
            <View style={[styles.avatar, { backgroundColor: '#111827' }]}>
              <ThemedText style={{ color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 17 }}>
                {(displayName || 'C')?.[0]?.toString().toUpperCase()}
              </ThemedText>
            </View>
            <View style={styles.headerTextWrap}>
              <ThemedText style={styles.headerTitle} numberOfLines={1}>{displayName}</ThemedText>
              <ThemedText style={styles.headerSubtitle}>Counseling Conversation</ThemedText>
            </View>
          </View>
          <Pressable 
            onPress={toggleChat} 
            onPressIn={() => doHaptic('selection')} 
            style={({ pressed }) => [styles.statusBadgeBtn, { opacity: pressed ? 0.8 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={chatOpen ? 'Chat is open, tap to close' : 'Chat is closed, tap to reopen'}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          > 
            <StatusBadge open={chatOpen} />
          </Pressable>
        </Animated.View>

        {/* Chat list + Composer */}
        <Animated.View style={[{ flex: 1 }, makeFadeUp(entrance.messages)]}>
          <FlatList
            ref={listRef}
            data={listData}
            keyExtractor={(it) => it.id}
            renderItem={renderRow}
            contentContainerStyle={listData.length === 0 ? { flex: 1 } : { paddingHorizontal: 12, paddingVertical: 12, paddingBottom: 6 }}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            initialNumToRender={12}
            maxToRenderPerBatch={24}
            windowSize={7}
            updateCellsBatchingPeriod={50}
            removeClippedSubviews
            ListEmptyComponent={loading ? <LoadingIndicator /> : <WelcomeMessage />}
            ListFooterComponent={typing ? <TypingIndicator palette={palette} /> : null}
          />
        </Animated.View>

          <Animated.View style={[styles.inputBarWrap, { borderTopColor: palette.border, backgroundColor: palette.background, paddingBottom: insets.bottom || 8 }, makeFadeUp(entrance.input)]}> 
            {chatOpen ? (
              <View
                style={[
                  styles.inputBar,
                  {
                    backgroundColor: palette.background,
                    borderColor: inputFocused ? '#0D8C4F' : palette.border,
                    borderWidth: inputFocused ? 1.5 : 1,
                  },
                ]}
              > 
                <Pressable onPressIn={() => doHaptic('light')} style={({ pressed }) => [styles.attachBtn, { opacity: pressed ? 0.8 : 1 }]} accessibilityRole="button" accessibilityLabel="Add attachment">
                  <Icon name="plus" size={18} color={palette.icon} />
                </Pressable>
                <TextInput
                  value={input}
                  onChangeText={setInput}
                  placeholder="Type your message..."
                  placeholderTextColor={palette.muted}
                  // @ts-ignore - web outline
                  style={[styles.input, { height: inputHeight, outlineStyle: 'none' } as any]}
                  onSubmitEditing={send}
                  multiline
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  selectionColor="#0D8C4F"
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
            ) : (
              <View style={styles.closedChatContainer}>
                <View style={styles.closedChatContent}>
                  <View style={styles.closedIconWrap}>
                    <Icon name="check-circle" size={20} color="#6B7280" />
                  </View>
                  <View style={styles.closedTextWrap}>
                    <ThemedText style={styles.closedTitle}>Conversation Ended</ThemedText>
                    <ThemedText style={styles.closedSubtitle}>This chat has been closed by you</ThemedText>
                  </View>
                </View>
                <Pressable 
                  onPress={toggleChat} 
                  onPressIn={() => doHaptic('selection')}
                  style={({ pressed }) => [styles.reopenButton, { opacity: pressed ? 0.8 : 1 }]}
                >
                  <Icon name="refresh-ccw" size={16} color="#0D8C4F" />
                  <ThemedText style={styles.reopenButtonText}>Reopen Chat</ThemedText>
                </Pressable>
              </View>
            )}
          </Animated.View>
      </KeyboardAvoidingView>
    </GlobalScreenWrapper>
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
    minHeight: 64,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: '#111827',
    lineHeight: 20,
  },
  headerSubtitle: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: -1,
  },
  statusBadgeBtn: {
    flexShrink: 0,
    marginLeft: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  badge: {
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  badgeText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
  sepContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 16, paddingHorizontal: 16 },
  sepLine: { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
  sepWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: '#ECFDF5', marginHorizontal: 12 },
  sepText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#0D8C4F' },
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
  // Closed chat styles
  closedChatContainer: {
    padding: 16,
    gap: 12,
  },
  closedChatContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F9FAFB',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  closedIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closedTextWrap: {
    flex: 1,
    gap: 2,
  },
  closedTitle: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#374151',
  },
  closedSubtitle: {
    fontSize: 13,
    color: '#6B7280',
  },
  reopenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ECFDF5',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  reopenButtonText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: '#0D8C4F',
  },
  // Welcome message styles
  welcomeContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  welcomeDecorOuter: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  welcomeDecorMiddle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#A7F3D0',
  },
  welcomeTitle: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  welcomeName: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    color: '#111827',
    marginBottom: 12,
  },
  welcomeText: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
    maxWidth: 280,
  },
  welcomeBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 100,
    marginBottom: 24,
  },
  welcomeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  welcomeBadgeText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: '#374151',
  },
  welcomeBadgeDivider: {
    width: 1,
    height: 12,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 12,
  },
  welcomeHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  welcomeHintText: {
    fontSize: 13,
    color: '#9CA3AF',
    fontFamily: 'Inter_500Medium',
  },
  // Loading indicator styles
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#6B7280',
    fontFamily: 'Inter_500Medium',
  },
});
