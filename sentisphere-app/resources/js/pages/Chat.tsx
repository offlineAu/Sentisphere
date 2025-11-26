import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Send, MessageSquare, User, Search } from "lucide-react";
import { useSidebar } from "../components/SidebarContext";
import Sidebar from "../components/Sidebar";
import { LoadingSpinner } from "../components/loading-spinner";
import styles from "./Chat.module.css";
import api from "../lib/api";
import { sessionStatus } from "../lib/auth";
import { router } from "@inertiajs/react";

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
}

interface ChatMessage {
  id: number;
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
  const [unreadCounts, setUnreadCounts] = useState<Record<number, number>>({});
  const [messagesByConversation, setMessagesByConversation] = useState<Record<number, ChatMessage[]>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");
  const [loading, setLoading] = useState(true);

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
        setConversations(res.data);
        if (res.data.length > 0) {
          setActiveConversation(res.data[0].conversation_id);
        }
      } catch (err) {
        console.error("Error fetching conversations:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchConversations();
  }, [userId, authenticated]);

  // Fetch messages when active conversation changes
  useEffect(() => {
    if (!activeConversation || !authenticated) return;
    api
      .get<ChatMessage[]>(`/conversations/${activeConversation}/messages`)
      .then((res) => {
        setMessages(res.data);
        setMessagesByConversation((prev) => ({ ...prev, [activeConversation]: res.data }));
        const unread = res.data.filter((m) => !Boolean((m as any).is_read) && m.sender_id !== userId).length;
        setUnreadCounts((prev) => ({ ...prev, [activeConversation]: unread }));
      })
      .catch((err) => console.error("Error fetching messages:", err));
  }, [activeConversation, authenticated, userId]);

  // Fetch participant nickname when conversation changes
  const currentConversation = conversations.find(
    (c) => c.conversation_id === activeConversation
  );

  useEffect(() => {
    if (!currentConversation) {
      setParticipantNickname("");
      return;
    }
    api
      .get<{ nickname: string }>(`/users/${currentConversation.initiator_user_id}`)
      .then((res) => setParticipantNickname(res.data.nickname || ""))
      .catch(() => setParticipantNickname(""));
  }, [currentConversation]);

  // Lightweight polling to fetch messages per conversation and compute unread via is_read
  useEffect(() => {
    if (conversations.length === 0 || !authenticated) return;
    const poll = async () => {
      const ids = conversations.map((c) => c.conversation_id);
      for (const id of ids) {
        try {
          const { data } = await api.get<ChatMessage[]>(`/conversations/${id}/messages`);
          setMessagesByConversation((prev) => ({ ...prev, [id]: data }));
          const unread = data.filter((m) => !Boolean((m as any).is_read) && m.sender_id !== userId).length;
          setUnreadCounts((prev) => ({ ...prev, [id]: unread }));
        } catch (e) {
          // noop
        }
      }
    };
    // initial
    poll();
    // interval
    const interval = setInterval(poll, 15000);
    return () => clearInterval(interval);
  }, [conversations]);

  // Auto-scroll to bottom on new messages
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, activeConversation]);

  // Handle send
  const handleSend = () => {
    if (
      !newMessage.trim() ||
      !activeConversation ||
      !currentConversation ||
      currentConversation.status !== "open"
    )
      return;
    api
      .post<ChatMessage>(`/conversations/${activeConversation}/messages`, {
        sender_id: userId,
        content: newMessage,
      })
      .then((res) => {
        setMessages((prev) => [...prev, res.data]);
        setNewMessage("");
        setMessagesByConversation((prev) => {
          const list = prev[activeConversation] || [];
          return { ...prev, [activeConversation]: [...list, res.data] };
        });
        // sending a message shouldn't increase unread for self
        setUnreadCounts((prev) => ({ ...prev, [activeConversation]: prev[activeConversation] || 0 }));
      })
      .catch((err) => console.error("Error sending message:", err));
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

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main
        className={`transition-all duration-200 min-h-screen space-y-4 ${
          open ? "pl-[17rem]" : "pl-[5rem]"
        } pt-1 pr-6 pb-6`}
      >
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="p-4 sm:p-6 space-y-4 max-w-full min-h-0"
        >
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className={styles.headerTitle}>Chat Conversations</h1>
              <p className={styles.headerSubtitle}>
                Manage and respond to student concerns.
              </p>
            </div>
            <div className="flex items-center gap-2 self-stretch md:self-auto">
              <button className="text-xs px-3 py-1.5 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-100">
                Email
              </button>
              <button className="text-xs px-3 py-1.5 rounded-full bg-emerald-600 text-white shadow hover:bg-emerald-700">
                Chat
              </button>
            </div>
          </div>
          {/* Chat Section */}
          <div className="flex gap-4 min-h-0 items-stretch overflow-hidden">
            {/* Sidebar (Conversations) */}
            <div className="hidden md:block md:w-[340px] flex-none min-h-0 min-w-0">
              <div className="bg-white rounded-2xl shadow p-4 h-[82vh] min-h-0 flex flex-col overflow-hidden">
                <div className="flex items-center gap-2 mb-3 flex-none">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search messages..."
                      className="w-full pl-10 pr-3 py-2 rounded-xl border border-gray-300 focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                    <Search className="h-4 w-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  </div>
                </div>
                <div className="overflow-y-scroll flex-1 min-h-0" style={{ scrollbarGutter: 'stable both-edges' }}>
                  <ul>
                    {conversations
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
                      })
                      .map((c) => {
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
                                  <div className="font-semibold text-sm text-gray-900 truncate">{c.subject || `Conversation #${convId}`}</div>
                                  <div className="text-[12px] text-gray-500 truncate">{c.initiator_nickname || ''}</div>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                  <span className="text-xs opacity-75">
                                    {(() => {
                                      const t = last?.timestamp || c.last_activity_at;
                                      return t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                                    })()}
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
                </div>
              </div>
            </div>

            {/* Chat Window */}
            <div className="flex-[1_1_0] min-h-0 min-w-0 sm:min-w-[480px] lg:min-w-[640px] w-full">
              <div className="bg-white rounded-2xl shadow flex flex-col h-[82vh] min-h-0 min-w-0 w-full overflow-hidden">
                {currentConversation ? (
                  <>
                    {/* Chat Header (compact) */}
                    <div className="px-4 py-3 border-b flex items-center justify-between bg-gradient-to-r from-emerald-50 to-transparent flex-none w-full">
                      <div className="min-w-0">
                        <h2 className="font-semibold text-[15px] text-[#0d8c4f] truncate">{currentConversation.subject || `Conversation #${currentConversation.conversation_id}`}</h2>
                        <div className="text-xs text-gray-500 truncate">{participantNickname}</div>
                        <div className="mt-1">
                          <span className={`text-[10px] px-2 py-[2px] rounded-full uppercase tracking-wide ${
                            currentConversation.status === 'open'
                              ? 'bg-green-100 text-green-700 border border-green-200'
                              : 'bg-red-100 text-red-700 border border-red-200'
                          }`}>
                            {currentConversation.status === 'open' ? 'OPEN' : 'ENDED'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button className="text-xs px-2.5 py-1 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-100">Details</button>
                        <User className="h-5 w-5 text-gray-500" />
                      </div>
                    </div>

                    {/* Messages */}
                    <div ref={messagesScrollRef} className="flex-1 min-h-0 min-w-0 w-full max-w-full p-4 overflow-y-scroll space-y-3" style={{ scrollbarGutter: 'stable both-edges', scrollBehavior: 'smooth' }}>
                      {messages.map((m) => (
                        <div
                          key={m.id}
                          className={`w-fit max-w-[600px] sm:max-w-[68%] px-4 py-2 rounded-2xl shadow-sm whitespace-pre-wrap break-words leading-relaxed overflow-hidden ${
                            m.sender_id === userId
                              ? "bg-[#2563eb] text-white ml-auto rounded-br-md"
                              : "bg-gray-100 text-[#333] mr-auto rounded-bl-md"
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words" style={{ wordBreak: 'break-word' }}>{m.content}</p>
                          <small className="block text-xs opacity-75 mt-1">
                            {new Date(m.timestamp).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </small>
                        </div>
                      ))}
                    </div>

                    {/* Input */}
                    <div className="p-3 border-t flex gap-2 flex-none h-[64px] items-center">
                      <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
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
                            ? "focus:ring-[#0d8c4f] text-[#222]"
                            : "bg-gray-100 text-gray-400 cursor-not-allowed"
                        }`}
                        disabled={currentConversation.status !== "open"}
                      />
                      <button
                        onClick={handleSend}
                        className={`rounded-xl px-4 h-10 flex items-center gap-2 transition ${
                          currentConversation.status === "open"
                            ? "bg-[#0d8c4f] text-white hover:bg-[#0b6d3f]"
                            : "bg-gray-300 text-gray-500 cursor-not-allowed"
                        }`}
                        disabled={currentConversation.status !== "open"}
                      >
                        <Send className="h-4 w-4" /> Send
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-gray-500">
                    Select a conversation to start chatting
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

