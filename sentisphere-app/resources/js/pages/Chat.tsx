import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Send, MessageSquare, User, Search, X, Calendar, Mail, Activity, AlertTriangle } from "lucide-react";
import { useSidebar } from "../components/SidebarContext";
import Sidebar from "../components/Sidebar";
import { LoadingSpinner } from "../components/loading-spinner";
import styles from "./Chat.module.css";
import api from "../lib/api";
import { sessionStatus } from "../lib/auth";
import { router } from "@inertiajs/react";
import Pusher from "pusher-js";
import { usePusher } from "@/contexts/PusherContext";

// -----------------------------
// Types
// -----------------------------
interface Conversation {
  conversation_id: number;
  initiator_user_id: number;
  initiator_role: string;
  subject: string | null;
  status: "open" | "ended";
  created_at: string;
  last_activity_at: string | null;
  // Optional nickname; backend conversation payload does not currently include this,
  // so we treat it as a best-effort label and fall back to subject or id.
  initiator_nickname?: string;
  initiator_email?: string;
}

// Helper to format time in PHT (Asia/Manila)
const formatTimePHT = (timestamp: string | null | undefined): string => {
  if (!timestamp) return '';
  try {
    return new Date(timestamp).toLocaleTimeString('en-PH', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Manila',
    });
  } catch {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }
};

interface ChatMessage {
  id?: number;
  message_id?: number;
  client_msg_id?: string | null;
  conversation_id: number;
  sender_id: number;
  content: string;
  timestamp: string;
  is_read?: boolean | number;
}

// -----------------------------
// Component
// -----------------------------
export default function Chat() {
  const { open } = useSidebar();
  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const [userId, setUserId] = useState<number | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeConversation, setActiveConversation] = useState<number | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [participantNickname, setParticipantNickname] = useState<string>("");
  const [participantEmail, setParticipantEmail] = useState<string>("");
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [typingUser, setTypingUser] = useState<string>("");
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypingSentRef = useRef<number>(0);
  const [unreadCounts, setUnreadCounts] = useState<Record<number, number>>({});
  const [messagesByConversation, setMessagesByConversation] = useState<Record<number, ChatMessage[]>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");
  const [loading, setLoading] = useState(true);
  const pusherRef = useRef<Pusher | null>(null);
  const pusherChannelRef = useRef<any>(null);
  const prevSubRef = useRef<number | null>(null);
  
  // Student details modal state
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [studentDetails, setStudentDetails] = useState<{
    nickname: string;
    email?: string;
    recentMood?: string;
    totalCheckins?: number;
    lastCheckin?: string;
    hasAlerts?: boolean;
  } | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Global Pusher context for cross-page real-time updates
  const { 
    onNewMessage, 
    onStatusChange, 
    markConversationRead,
    refreshUnreadCount,
    conversationStatuses,
  } = usePusher();

  const normalizeMessage = (m: any): ChatMessage => ({
    ...m,
    message_id: m?.message_id ?? m?.id,
    timestamp: typeof m?.timestamp === "string" ? m.timestamp : new Date(m?.timestamp).toISOString(),
  });

  const upsertMessage = (
    conversationId: number,
    incomingRaw: any,
  ) => {
    const incoming = normalizeMessage(incomingRaw);
    setMessagesByConversation((prev) => {
      const list = prev[conversationId] || [];
      const exists = list.some(
        (x) => x.message_id === incoming.message_id || (
          incoming.client_msg_id && x.client_msg_id === incoming.client_msg_id
        )
      );
      if (exists) return prev;
      const next = [...list, incoming].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      return { ...prev, [conversationId]: next };
    });
    if (conversationId === activeConversation) {
      setMessages((prev) => {
        const exists = prev.some(
          (x) => x.message_id === incoming.message_id || (
            incoming.client_msg_id && x.client_msg_id === incoming.client_msg_id
          )
        );
        if (exists) return prev;
        const next = [...prev, incoming].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        return next;
      });
    }
    // Update unread badge if message belongs to a different conversation and is from other user
    if (conversationId !== activeConversation && incoming.sender_id !== userId) {
      setUnreadCounts((prev) => ({
        ...prev,
        [conversationId]: (prev[conversationId] || 0) + 1,
      }));
    }
  };

  // Register callbacks with global Pusher context for cross-page updates
  useEffect(() => {
    // When a new message arrives from any page, update our local state
    onNewMessage.current = (msg: any) => {
      console.log('[Chat] Global new message callback:', msg);
      if (msg?.conversation_id) {
        upsertMessage(Number(msg.conversation_id), msg);
      }
    };

    // When conversation status changes globally
    onStatusChange.current = (data: any) => {
      console.log('[Chat] Global status change callback:', data);
      if (data?.conversation_id && data?.status) {
        setConversations(prev => prev.map(c => 
          c.conversation_id === Number(data.conversation_id) 
            ? { ...c, status: data.status as 'open' | 'ended' } 
            : c
        ));
      }
    };

    return () => {
      onNewMessage.current = null;
      onStatusChange.current = null;
    };
  }, [activeConversation, userId]);

  // Sync conversation statuses from global context (fallback polling)
  useEffect(() => {
    if (conversationStatuses.size === 0) return;
    
    setConversations(prev => prev.map(c => {
      const globalStatus = conversationStatuses.get(c.conversation_id);
      if (globalStatus && globalStatus !== c.status) {
        return { ...c, status: globalStatus };
      }
      return c;
    }));
  }, [conversationStatuses]);

  // Check session authentication and redirect if needed
  useEffect(() => {
    let mounted = true;
    sessionStatus().then(s => {
      if (!mounted) return;
      if (s?.authenticated) {
        setAuthenticated(true);
        const idFromSession =
          (s as any)?.user?.id ?? (s as any)?.user?.user_id ?? null;
        if (idFromSession != null) {
          setUserId(Number(idFromSession));
        }
      } else {
        router.visit('/login');
      }
    });
    return () => { mounted = false; };
  }, []);

  // Fetch conversations
  useEffect(() => {
    if (!authenticated || userId == null) return;
    
    setLoading(true);
    const fetchConversations = async () => {
      try {
        const res = await api.get<Conversation[]>(`/conversations`);
        const unique = Array.from(new Map(res.data.map(c => [c.conversation_id, c])).values());

        // Enrich with initiator nickname and email for display
        const withNicknames = await Promise.all(
          unique.map(async (c) => {
            try {
              const { data } = await api.get<{ nickname: string; email?: string }>(`/users/${c.initiator_user_id}`);
              return { 
                ...c, 
                initiator_nickname: data.nickname || c.initiator_nickname,
                initiator_email: data.email || undefined,
              };
            } catch {
              return c;
            }
          })
        );

        setConversations(withNicknames);
        if (withNicknames.length > 0) {
          setActiveConversation(withNicknames[0].conversation_id);
        }
      } catch (err) {
        console.error("Error fetching conversations:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchConversations();
  }, [userId, authenticated]);

  // Fetch messages when active conversation changes - with immediate refresh
  useEffect(() => {
    if (!activeConversation || !authenticated) return;
    
    // IMPORTANT: Clear messages immediately when switching conversations
    // Use cached messages if available, otherwise show empty
    const cachedMessages = messagesByConversation[activeConversation] || [];
    setMessages(cachedMessages);
    
    // Also clear typing indicator when switching
    setIsTyping(false);
    
    // Track which conversation we're fetching for
    const fetchingForConversation = activeConversation;
    
    const fetchMessagesAndStatus = async () => {
      try {
        // Fetch messages
        const res = await api.get<ChatMessage[]>(`/conversations/${fetchingForConversation}/messages`);
        const data = (res.data || []).map(normalizeMessage);
        
        // Also fetch conversation details to get latest status
        const convRes = await api.get<Conversation>(`/conversations/${fetchingForConversation}`);
        
        // Only update if we're still on the same conversation
        if (fetchingForConversation === activeConversation) {
          setMessages(data);
          setMessagesByConversation((prev) => ({ ...prev, [fetchingForConversation]: data }));
          const unread = res.data.filter((m) => !Boolean((m as any).is_read) && m.sender_id !== userId).length;
          setUnreadCounts((prev) => ({ ...prev, [fetchingForConversation]: unread }));
          
          // Update conversation status from fresh data
          if (convRes.data?.status) {
            setConversations(prev => prev.map(c => 
              c.conversation_id === fetchingForConversation 
                ? { ...c, status: convRes.data.status } 
                : c
            ));
          }
          
          // Mark messages as read when opening conversation
          if (unread > 0) {
            try {
              await api.post(`/conversations/${fetchingForConversation}/read`);
              setUnreadCounts((prev) => ({ ...prev, [fetchingForConversation]: 0 }));
              // Refresh global unread count for sidebar badge
              refreshUnreadCount();
            } catch {
              // Ignore read marking errors
            }
          }
        }
      } catch (err) {
        console.error("Error fetching messages:", err);
      }
    };
    
    // Fetch immediately
    fetchMessagesAndStatus();
  }, [activeConversation, authenticated, userId]);

  // Fetch participant nickname when conversation changes
  const currentConversation = conversations.find(
    (c) => c.conversation_id === activeConversation
  );

  useEffect(() => {
    if (!currentConversation) {
      setParticipantNickname("");
      setParticipantEmail("");
      return;
    }
    api
      .get<{ nickname: string; email?: string }>(`/users/${currentConversation.initiator_user_id}`)
      .then((res) => {
        setParticipantNickname(res.data.nickname || "");
        setParticipantEmail(res.data.email || "");
      })
      .catch(() => {
        setParticipantNickname("");
        setParticipantEmail("");
      });
  }, [currentConversation]);

  // Lightweight polling to fetch messages per conversation and compute unread via is_read
  // Use a ref to track the current active conversation to avoid stale closure issues
  const activeConversationRef = useRef(activeConversation);
  useEffect(() => {
    activeConversationRef.current = activeConversation;
  }, [activeConversation]);
  
  useEffect(() => {
    if (conversations.length === 0 || !authenticated) return;
    
    const poll = async () => {
      const ids = conversations.map((c) => c.conversation_id);
      const currentActive = activeConversationRef.current;
      
      for (const id of ids) {
        try {
          const { data } = await api.get<ChatMessage[]>(`/conversations/${id}/messages`);
          const norm = (data || []).map(normalizeMessage);
          setMessagesByConversation((prev) => ({ ...prev, [id]: norm }));
          
          // Only update messages state if this is STILL the active conversation
          if (id === currentActive && id === activeConversationRef.current) {
            setMessages(norm);
          }
          const unread = data.filter((m) => !Boolean((m as any).is_read) && m.sender_id !== userId).length;
          setUnreadCounts((prev) => ({ ...prev, [id]: unread }));
        } catch (e) {
          // noop
        }
      }
    };
    
    // Don't poll immediately - let the conversation switch effect handle initial fetch
    // interval - poll every 10 seconds (reduced frequency to avoid race conditions)
    const interval = setInterval(poll, 10000);
    return () => clearInterval(interval);
  }, [conversations, authenticated, userId]);

  // Auto-scroll to bottom on new messages
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, activeConversation]);

  // Handle send - with fresh status check
  const handleSend = async () => {
    if (
      !newMessage.trim() ||
      !activeConversation ||
      !currentConversation ||
      currentConversation.status !== "open"
    )
      return;
    
    // Double-check conversation status before sending (prevents sending to ended chats)
    try {
      const statusCheck = await api.get<Conversation>(`/conversations/${activeConversation}`);
      if (statusCheck.data?.status === 'ended') {
        // Update local state to reflect ended status
        setConversations(prev => prev.map(c => 
          c.conversation_id === activeConversation 
            ? { ...c, status: 'ended' } 
            : c
        ));
        alert('This conversation has ended. You cannot send more messages.');
        return;
      }
    } catch {
      // Continue if status check fails
    }
    
    api
      .post<ChatMessage>(`/conversations/${activeConversation}/messages`, {
        sender_id: userId,
        content: newMessage,
      })
      .then((res) => {
        const nm = normalizeMessage(res.data);
        setMessages((prev) => {
          const exists = prev.some((x) => x.message_id === nm.message_id);
          if (exists) return prev;
          const next = [...prev, nm].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          return next;
        });
        setNewMessage("");
        setMessagesByConversation((prev) => {
          const list = prev[activeConversation] || [];
          const exists = list.some((x) => x.message_id === nm.message_id);
          const next = exists ? list : [...list, nm].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          return { ...prev, [activeConversation]: next };
        });
        setUnreadCounts((prev) => ({ ...prev, [activeConversation]: prev[activeConversation] || 0 }));
      })
      .catch((err) => console.error("Error sending message:", err));
  };

  // Initialize Pusher for real-time chat and subscribe to global conversations channel
  useEffect(() => {
    if (!authenticated) return;
    
    const pusherKey = (import.meta as any).env?.VITE_PUSHER_APP_KEY;
    const pusherCluster = (import.meta as any).env?.VITE_PUSHER_APP_CLUSTER || 'ap1';
    
    if (!pusherKey) {
      console.log('[Chat] Pusher not configured, using polling only');
      return;
    }
    
    try {
      const pusher = new Pusher(pusherKey, {
        cluster: pusherCluster,
      });
      pusherRef.current = pusher;
      
      pusher.connection.bind('connected', () => {
        console.log('[Chat] ✓ Pusher connected');
      });
      
      pusher.connection.bind('error', (err: any) => {
        console.log('[Chat] Pusher error:', err);
      });
      
      // Subscribe to global conversations channel for updates on ALL conversations
      const globalChannel = pusher.subscribe('conversations');
      
      // Listen for status changes (e.g., student ends chat)
      globalChannel.bind('status_changed', (data: any) => {
        console.log('[Chat] Conversation status changed:', data);
        if (data?.conversation_id && data?.status) {
          setConversations(prev => prev.map(c => 
            c.conversation_id === Number(data.conversation_id) 
              ? { ...c, status: data.status as 'open' | 'ended' } 
              : c
          ));
        }
      });
      
      // Listen for new conversations (e.g., student starts new chat)
      globalChannel.bind('new_conversation', async (data: any) => {
        console.log('[Chat] New conversation received:', data);
        // Refresh conversation list to get the new conversation with enriched data
        if (data?.conversation_id) {
          try {
            const res = await api.get<Conversation[]>("/counselor/conversations");
            const unique = Array.from(new Map(res.data.map(c => [c.conversation_id, c])).values());
            
            // Enrich with initiator nickname and email
            const withNicknames = await Promise.all(
              unique.map(async (c) => {
                try {
                  const { data: userData } = await api.get<{ nickname: string; email?: string }>(`/users/${c.initiator_user_id}`);
                  return { 
                    ...c, 
                    initiator_nickname: userData.nickname || c.initiator_nickname,
                    initiator_email: userData.email || undefined,
                  };
                } catch {
                  return c;
                }
              })
            );
            
            setConversations(withNicknames);
          } catch (err) {
            console.error("Error refreshing conversations:", err);
          }
        }
      });
      
      // Listen for new messages on any conversation (for unread badge updates)
      globalChannel.bind('new_message', (data: any) => {
        console.log('[Chat] New message on global channel:', data);
        if (data?.conversation_id && data?.sender_id !== userId) {
          // Update unread count for this conversation
          setUnreadCounts(prev => ({
            ...prev,
            [data.conversation_id]: (prev[data.conversation_id] || 0) + 1
          }));
        }
      });
      
      return () => {
        globalChannel.unbind_all();
        pusher.unsubscribe('conversations');
        pusher.disconnect();
        pusherRef.current = null;
      };
    } catch (e) {
      console.log('[Chat] Pusher init failed:', e);
    }
  }, [authenticated]);

  // Subscribe to active conversation channel for messages and typing
  useEffect(() => {
    const pusher = pusherRef.current;
    if (!pusher || !activeConversation) return;
    
    // Unsubscribe from previous channel
    if (pusherChannelRef.current) {
      pusherChannelRef.current.unbind_all();
      pusher.unsubscribe(`conversation-${prevSubRef.current}`);
    }
    
    // Subscribe to new conversation channel
    const channelName = `conversation-${activeConversation}`;
    console.log(`[Chat] Subscribing to ${channelName}`);
    const channel = pusher.subscribe(channelName);
    pusherChannelRef.current = channel;
    
    // Listen for new messages
    channel.bind('message', (data: any) => {
      console.log('[Chat] Pusher message received:', data);
      if (data?.message) {
        upsertMessage(Number(data.conversation_id), data.message);
        setIsTyping(false);
      }
    });
    
    // Listen for typing indicators
    channel.bind('typing', (data: any) => {
      console.log('[Chat] Typing event received:', data);
      if (data?.user_id !== userId && data?.is_typing !== false) {
        setIsTyping(true);
        setTypingUser(data?.user_name || data?.nickname || "Someone");
        // Clear typing after 3 seconds
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 3000);
      } else if (data?.is_typing === false) {
        setIsTyping(false);
      }
    });
    
    // Listen for read receipts
    channel.bind('messages_read', (data: any) => {
      console.log('[Chat] Messages read:', data);
      if (data?.reader_id && data?.reader_id !== userId) {
        // Update messages to show as read
        setMessages(prev => prev.map(m => 
          m.sender_id === userId ? { ...m, is_read: true } : m
        ));
        setMessagesByConversation(prev => ({
          ...prev,
          [activeConversation]: (prev[activeConversation] || []).map(m =>
            m.sender_id === userId ? { ...m, is_read: true } : m
          )
        }));
      }
    });
    
    // Listen for conversation status changes on this specific channel
    channel.bind('status', (data: any) => {
      console.log('[Chat] Conversation status changed (channel):', data);
      if (data?.status) {
        setConversations(prev => prev.map(c => 
          c.conversation_id === activeConversation 
            ? { ...c, status: data.status as 'open' | 'ended' } 
            : c
        ));
      }
    });
    
    prevSubRef.current = activeConversation;
    
    return () => {
      channel.unbind_all();
    };
  }, [activeConversation, userId]);

  // Fetch student details for the details modal
  const fetchStudentDetails = async (studentUserId: number) => {
    setLoadingDetails(true);
    setShowDetailsModal(true);
    try {
      // Fetch user info
      const userRes = await api.get<{ nickname: string; email?: string }>(`/users/${studentUserId}`);
      
      // Fetch recent check-ins for this student
      let recentMood = "Unknown";
      let totalCheckins = 0;
      let lastCheckin = "";
      let hasAlerts = false;
      
      try {
        const checkinsRes = await api.get<any[]>(`/checkins`, { params: { user_id: studentUserId, limit: 5 } });
        if (checkinsRes.data && checkinsRes.data.length > 0) {
          totalCheckins = checkinsRes.data.length;
          recentMood = checkinsRes.data[0]?.mood_level || "Unknown";
          lastCheckin = checkinsRes.data[0]?.created_at || "";
        }
      } catch {
        // Ignore if checkins endpoint fails
      }
      
      try {
        const alertsRes = await api.get<any[]>(`/alerts`, { params: { user_id: studentUserId, limit: 1 } });
        hasAlerts = alertsRes.data && alertsRes.data.length > 0;
      } catch {
        // Ignore if alerts endpoint fails
      }
      
      setStudentDetails({
        nickname: userRes.data.nickname || `User #${studentUserId}`,
        email: userRes.data.email,
        recentMood,
        totalCheckins,
        lastCheckin,
        hasAlerts,
      });
    } catch (err) {
      console.error("Error fetching student details:", err);
      setStudentDetails({
        nickname: `User #${studentUserId}`,
      });
    } finally {
      setLoadingDetails(false);
    }
  };

  // Show loading spinner while data is being fetched
  if (loading) {
    return (
      <div className="flex h-[80vh] w-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <LoadingSpinner size="lg" className="text-primary" />
          <p className="text-muted-foreground">Loading conversations...</p>
        </div>
      </div>
    );
  }

  const filteredConversations = conversations
    .filter((c) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const nickname = (c.initiator_nickname || "").toLowerCase();
      const subject = (c.subject || "").toLowerCase();
      if (nickname.includes(q) || subject.includes(q)) return true;
      const msgs = messagesByConversation[c.conversation_id] || [];
      return msgs.some((m) => m.content.toLowerCase().includes(q));
    })
    .filter((c) => {
      if (filter === "all") return true;
      const unread = unreadCounts[c.conversation_id] || 0;
      return filter === "unread" ? unread > 0 : unread === 0;
    });

  return (
    <div className="flex min-h-screen dark:bg-neutral-900">
      <Sidebar />
      <main
        className={`transition-all duration-200 min-h-screen space-y-4 ${
          open ? "pl-[17rem]" : "pl-[5rem]"
        } pt-1 pr-6 pb-6 dark:bg-neutral-900`}
      >
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="pr-4 sm:pr-6 pl-2 sm:pl-4 py-4 sm:py-6 space-y-4 max-w-full min-h-0"
        >
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="ml-2">
              <h1 className={`${styles.headerTitle} dark:text-neutral-100`}>Chat Conversations</h1>
              <p className={`${styles.headerSubtitle} dark:text-neutral-400`}>
                Manage and respond to student concerns.
              </p>
              <div />
            </div>
          </div>
          {/* Chat Section */}
          <div className="flex gap-4 min-h-0 items-stretch overflow-hidden">
            {/* Sidebar (Conversations) */}
            <div className="hidden md:block md:w-[340px] flex-none min-h-0 min-w-0">
              <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow p-4 h-[82vh] min-h-0 flex flex-col overflow-hidden">
                <div className="flex items-center gap-2 mb-3 flex-none">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search messages..."
                      className="w-full pl-10 pr-3 py-2 rounded-xl border border-gray-300 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100 focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                    <Search className="h-4 w-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  </div>
                </div>
                <div className="overflow-y-scroll flex-1 min-h-0" style={{ scrollbarGutter: 'stable both-edges' }}>
                  {filteredConversations.length === 0 ? (
                    <div className="text-sm text-gray-500 dark:text-neutral-400 px-2 py-4">
                      No conversations available yet. You&apos;ll see student chats here once they reach out.
                    </div>
                  ) : (
                    <ul>
                      {filteredConversations.map((c) => {
                      const convId = c.conversation_id;
                      const total = messagesByConversation[convId]?.length || 0;
                      const unread = unreadCounts[convId] || 0;
                      const last = (messagesByConversation[convId] || [])[total - 1];
                      const isActive = activeConversation === convId;
                      return (
                        <li
                          key={convId}
                          onClick={() => {
                            setActiveConversation(convId);
                            // optimistically clear unread, and notify backend to mark as read
                            setUnreadCounts((prev) => ({ ...prev, [convId]: 0 }));
                            api
                              .post(`/conversations/${convId}/read`, null, { params: { user_id: userId }})
                              .catch(() => {/* ignore */});
                          }}
                          className={`relative pl-4 pr-3 py-3 cursor-pointer text-left transition select-none rounded-xl box-border border ${
                            isActive
                              ? "bg-emerald-50 border-emerald-300 ring-2 ring-emerald-400 text-emerald-900"
                              : "bg-white hover:bg-gray-50 border-gray-200 text-[#333]"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="font-semibold text-sm text-gray-900 truncate">{c.initiator_nickname || `Conversation #${convId}`}</div>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                  <span className="text-xs opacity-75">
                                    {formatTimePHT(last?.timestamp || c.last_activity_at)}
                                  </span>
                                  <span
                                    className={`text-[10px] px-2 py-[2px] rounded-full uppercase tracking-wide ${
                                      c.status === "open"
                                        ? isActive
                                          ? "bg-emerald-600/10 text-emerald-700 border border-emerald-200"
                                          : "bg-green-100 text-green-700 border border-green-200"
                                        : isActive
                                        ? "bg-rose-600/10 text-rose-700 border border-rose-200"
                                        : "bg-red-100 text-red-700 border border-red-200"
                                    }`}
                                  >
                                    {c.status === "open" ? "OPEN" : "ENDED"}
                                  </span>
                                  {unread > 0 && !isActive && (
                                    <span className="inline-flex items-center justify-center text-[11px] font-semibold text-white bg-red-600 rounded-full min-w-6 h-6 px-2">
                                      {unread}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="mt-1 text-[13px] text-gray-700 truncate">
                                {last ? `${last.sender_id === userId ? 'You: ' : ''}${last.content}` : ''}
                              </div>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            {/* Chat Window */}
            <div className="flex-[1_1_0] min-h-0 min-w-0 sm:min-w-[480px] lg:min-w-[640px] w-full">
              <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow flex flex-col h-[82vh] min-h-0 min-w-0 w-full overflow-hidden">
                {currentConversation ? (
                  <>
                    {/* Chat Header (compact) */}
                    <div className="px-4 py-3 border-b flex items-center justify-between bg-gradient-to-r from-emerald-50 to-transparent dark:from-neutral-700 dark:to-transparent flex-none w-full">
                      <div className="min-w-0">
                        <h2 className="font-semibold text-[15px] text-primary dark:text-emerald-400 truncate">
                          {currentConversation.initiator_nickname || participantNickname || `Conversation #${currentConversation.conversation_id}`}
                        </h2>
                        {(currentConversation.initiator_email || participantEmail) && (
                          <div className="text-xs text-gray-500 dark:text-neutral-400 truncate">
                            {currentConversation.initiator_email || participantEmail}
                          </div>
                        )}
                        <div className="mt-1 flex items-center gap-2">
                          <span className={`text-[10px] px-2 py-[2px] rounded-full uppercase tracking-wide ${
                            currentConversation.status === 'open'
                              ? 'bg-green-100 text-green-700 border border-green-200'
                              : 'bg-red-100 text-red-700 border border-red-200'
                          }`}>
                            {currentConversation.status === 'open' ? 'OPEN' : 'ENDED'}
                          </span>
                          {isTyping && (
                            <span className="text-xs text-emerald-600 dark:text-emerald-400 italic animate-pulse">
                              {typingUser} is typing...
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => fetchStudentDetails(currentConversation.initiator_user_id)}
                          className="text-xs px-2.5 py-1 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-100 active:bg-gray-200 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-700 transition-colors"
                        >
                          Details
                        </button>
                        <User className="h-5 w-5 text-gray-500 dark:text-neutral-400" />
                      </div>
                    </div>

                    {/* Student Details Modal */}
                    {showDetailsModal && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                        <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-xl p-6 max-w-md w-full">
                          <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-semibold text-primary dark:text-emerald-400">Student Details</h3>
                            <button 
                              onClick={() => {
                                setShowDetailsModal(false);
                                setStudentDetails(null);
                              }}
                              className="text-gray-500 hover:text-gray-700 dark:text-neutral-400 dark:hover:text-neutral-200"
                            >
                              <X className="h-5 w-5" />
                            </button>
                          </div>
                          
                          {loadingDetails ? (
                            <div className="flex items-center justify-center py-8">
                              <LoadingSpinner size="md" className="text-primary" />
                            </div>
                          ) : studentDetails ? (
                            <div className="space-y-4">
                              <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-neutral-700 rounded-xl">
                                <div className="h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center">
                                  <User className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                                </div>
                                <div>
                                  <div className="font-semibold text-gray-900 dark:text-white">{studentDetails.nickname}</div>
                                  {studentDetails.email && (
                                    <div className="text-sm text-gray-500 dark:text-neutral-400 flex items-center gap-1">
                                      <Mail className="h-3 w-3" />
                                      {studentDetails.email}
                                    </div>
                                  )}
                                </div>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-3">
                                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                                  <div className="text-xs text-blue-600 dark:text-blue-400 mb-1 flex items-center gap-1">
                                    <Activity className="h-3 w-3" />
                                    Recent Mood
                                  </div>
                                  <div className="font-semibold text-gray-900 dark:text-white">{studentDetails.recentMood || "N/A"}</div>
                                </div>
                                <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
                                  <div className="text-xs text-purple-600 dark:text-purple-400 mb-1 flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    Check-ins
                                  </div>
                                  <div className="font-semibold text-gray-900 dark:text-white">{studentDetails.totalCheckins || 0}</div>
                                </div>
                              </div>
                              
                              {studentDetails.lastCheckin && (
                                <div className="text-xs text-gray-500 dark:text-neutral-400">
                                  Last check-in: {new Date(studentDetails.lastCheckin).toLocaleDateString('en-PH', { 
                                    month: 'short', 
                                    day: 'numeric', 
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </div>
                              )}
                              
                              {studentDetails.hasAlerts && (
                                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl text-red-600 dark:text-red-400">
                                  <AlertTriangle className="h-4 w-4" />
                                  <span className="text-sm">This student has active alerts</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-center text-gray-500 py-4">No details available</div>
                          )}
                          
                          <div className="mt-6 flex justify-end">
                            <button
                              onClick={() => {
                                setShowDetailsModal(false);
                                setStudentDetails(null);
                              }}
                              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-neutral-300 bg-gray-100 dark:bg-neutral-700 rounded-lg hover:bg-gray-200 dark:hover:bg-neutral-600 transition-colors"
                            >
                              Close
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Messages */}
                    <div ref={messagesScrollRef} className="flex-1 min-h-0 min-w-0 w-full max-w-full p-4 overflow-y-scroll space-y-3" style={{ scrollbarGutter: 'stable both-edges', scrollBehavior: 'smooth' }}>
                      {messages.map((m, idx) => {
                        const isOwn = m.sender_id === userId;
                        const isRead = Boolean(m.is_read);
                        // Show read receipt only on last own message that's read
                        const isLastOwnMessage = isOwn && messages.slice(idx + 1).every(msg => msg.sender_id !== userId);
                        
                        return (
                          <div
                            key={String(m.message_id ?? m.id ?? `c:${m.client_msg_id ?? Math.random()}`)}
                            className={`w-fit max-w-[600px] sm:max-w-[68%] ${isOwn ? "ml-auto" : "mr-auto"}`}
                          >
                            <div
                              className={`px-4 py-2 rounded-2xl shadow-sm whitespace-pre-wrap break-words leading-relaxed overflow-hidden ${
                                isOwn
                                  ? "bg-[#2563eb] text-white rounded-br-md"
                                  : "bg-gray-100 text-[#333] rounded-bl-md"
                              }`}
                            >
                              <p className="whitespace-pre-wrap break-words" style={{ wordBreak: 'break-word' }}>{m.content}</p>
                              <small className="block text-xs opacity-75 mt-1">
                                {formatTimePHT(m.timestamp)}
                              </small>
                            </div>
                            {/* Read receipt indicator for own messages */}
                            {isOwn && isLastOwnMessage && (
                              <div className="text-right text-[10px] text-gray-400 mt-0.5 pr-1">
                                {isRead ? "✓✓ Read" : "✓ Sent"}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Input */}
                    <div className="p-3 border-t flex gap-2 flex-none h-[64px] items-center">
                      <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => {
                          setNewMessage(e.target.value);
                          // Send typing indicator via API (throttled to once per 2 seconds)
                          const now = Date.now();
                          if (now - lastTypingSentRef.current > 2000 && activeConversation) {
                            lastTypingSentRef.current = now;
                            // Fire-and-forget API call for typing indicator
                            api.post(`/counselor/conversations/${activeConversation}/typing`, { is_typing: true })
                              .catch(() => { /* ignore errors */ });
                          }
                        }}
                        onKeyDown={(e) =>
                          e.key === "Enter" ? handleSend() : null
                        }
                        placeholder={
                          currentConversation.status === "open"
                            ? "Type your message..."
                            : "This conversation has ended."
                        }
                        className={`flex-1 h-10 border rounded-xl px-4 py-2 outline-none focus:ring-2 ${
                          currentConversation.status === "open"
                            ? "focus:ring-[var(--ring)] text-[#222] dark:bg-neutral-700 dark:text-neutral-100 dark:border-neutral-600"
                            : "bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-neutral-800 dark:text-neutral-500"
                        }`}
                        disabled={currentConversation.status !== "open"}
                      />
                      <button
                        onClick={handleSend}
                        className={`rounded-xl px-4 h-10 flex items-center gap-2 transition ${
                          currentConversation.status === "open"
                            ? "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80"
                            : "bg-gray-300 text-gray-500 cursor-not-allowed"
                        }`}
                        disabled={currentConversation.status !== "open"}
                      >
                        <Send className="h-4 w-4" /> Send
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-gray-500 text-center px-6">
                    <p className="max-w-md mx-auto text-sm sm:text-base leading-relaxed">
                      {conversations.length === 0
                        ? "There are no conversations yet. You'll see chats here when students start messaging you."
                        : "Select a conversation to start chatting"}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}

