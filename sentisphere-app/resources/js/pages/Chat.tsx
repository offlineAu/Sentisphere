import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Send, MessageSquare, User } from "lucide-react";
import { useSidebar } from "../components/SidebarContext";
import Sidebar from "../components/Sidebar";
import styles from "./Chat.module.css";
import axios from "axios";
const API_BASE = (import.meta as any).env?.VITE_API_URL || "";

// -----------------------------
// Types
// -----------------------------
interface Conversation {
  id: number;
  initiator_user_id: number;
  initiator_role: string;
  subject: string;
  status: "open" | "ended";
  created_at: string;
  last_activity_at: string;
  initiator_nickname: string; // <-- add this
}

interface ChatMessage {
  id: number;
  conversation_id: number;
  sender_id: number;
  content: string;
  timestamp: string;
}

// -----------------------------
// Component
// -----------------------------
export default function Chat() {
  const { open } = useSidebar();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeConversation, setActiveConversation] = useState<number | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [participantNickname, setParticipantNickname] = useState<string>("");

  // ⚡ Change this for logged-in user (student/counselor)
  const userId = 22; // put your counselor's user_id from the DB

  // Fetch conversations
  useEffect(() => {
    axios
      .get<Conversation[]>(`${API_BASE}/api/conversations`, {
        params: { user_id: userId },
      })
      .then((res) => {
        setConversations(res.data);
        if (res.data.length > 0) {
          setActiveConversation(res.data[0].id);
        }
      })
      .catch((err) => console.error("Error fetching conversations:", err));
  }, [userId]);

  // Fetch messages when active conversation changes
  useEffect(() => {
    if (!activeConversation) return;
    axios
      .get<ChatMessage[]>(
        `${API_BASE}/api/conversations/${activeConversation}/messages`
      )
      .then((res) => setMessages(res.data))
      .catch((err) => console.error("Error fetching messages:", err));
  }, [activeConversation]);

  // Fetch participant nickname when conversation changes
  const currentConversation = conversations.find(
    (c) => c.id === activeConversation
  );

  useEffect(() => {
    if (!currentConversation) {
      setParticipantNickname("");
      return;
    }
    axios
      .get<{ nickname: string }>(`${API_BASE}/api/users/${currentConversation.initiator_user_id}`)
      .then((res) => setParticipantNickname(res.data.nickname || ""))
      .catch(() => setParticipantNickname(""));
  }, [currentConversation]);

  // Handle send
  const handleSend = () => {
    if (
      !newMessage.trim() ||
      !activeConversation ||
      !currentConversation ||
      currentConversation.status !== "open"
    )
      return;
    axios
      .post<ChatMessage>(
        `${API_BASE}/api/conversations/${activeConversation}/messages`,
        {
          sender_id: userId,
          content: newMessage,
        }
      )
      .then((res) => {
        setMessages((prev) => [...prev, res.data]);
        setNewMessage("");
      })
      .catch((err) => console.error("Error sending message:", err));
  };

  return (
    <div className="flex bg-[#f5f5f5] min-h-screen">
      <Sidebar />
      <main
        className={`transition-all duration-200 bg-[#f5f5f5] min-h-screen space-y-6 ${
          open ? "pl-[17rem]" : "pl-[4.5rem]"
        } pt-6 pr-6 pb-6`}
      >
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="p-4 sm:p-6 space-y-6 max-w-full"
        >
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className={styles.headerTitle}>Chat Conversations</h1>
              <p className={styles.headerSubtitle}>
                Manage and respond to student concerns.
              </p>
            </div>
          </div>

          {/* Chat Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Sidebar (Conversations) */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl shadow p-4">
                <h3 className="font-semibold text-[#0d8c4f] text-lg mb-3 flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" /> Conversations
                </h3>
                <ul className="space-y-2">
                  {conversations.map((c) => (
                    <li
                      key={c.id}
                      onClick={() => setActiveConversation(c.id)}
                      className={`p-3 rounded-xl cursor-pointer border text-left ${
                        activeConversation === c.id
                          ? "bg-[#0d8c4f] text-white border-[#0d8c4f]"
                          : "bg-[#f7fafd] text-[#333] border-[#e5e5e5] hover:bg-[#eef5f0]"
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-medium">
                          {/* Optionally show nickname here too */}
                          {c.initiator_nickname}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-lg capitalize ${
                            c.status === "open"
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-200 text-gray-600"
                          }`}
                        >
                          {c.status}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Chat Window */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-2xl shadow flex flex-col h-[70vh]">
                {currentConversation ? (
                  <>
                    {/* Chat Header */}
                    <div className="p-4 border-b flex justify-between items-center">
                      <h2
                        className={`font-semibold text-lg ${
                          currentConversation.status === "ended"
                            ? "text-gray-400"
                            : "text-[#0d8c4f]"
                        }`}
                      >
                        {currentConversation.initiator_nickname}
                      </h2>
                      <User className="h-5 w-5 text-gray-500" />
                    </div>

                    {/* Messages */}
                    <div className="flex-1 p-4 overflow-y-auto space-y-4">
                      {messages.map((m) => (
                        <div
                          key={m.id}
                          className={`max-w-[70%] px-4 py-2 rounded-2xl shadow-sm ${
                            m.sender_id === userId
                              ? "bg-[#2563eb] text-white ml-auto rounded-br-md"
                              : "bg-gray-100 text-[#333] mr-auto rounded-bl-md"
                          }`}
                        >
                          <p>{m.content}</p>
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
                    <div className="p-3 border-t flex gap-2">
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
                        className={`flex-1 border rounded-xl px-4 py-2 outline-none focus:ring-2 ${
                          currentConversation.status === "open"
                            ? "focus:ring-[#0d8c4f] text-[#222]"
                            : "bg-gray-100 text-gray-400 cursor-not-allowed"
                        }`}
                        disabled={currentConversation.status !== "open"}
                      />
                      <button
                        onClick={handleSend}
                        className={`rounded-xl px-4 flex items-center gap-2 transition ${
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
