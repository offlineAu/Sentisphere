import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Send, MessageSquare, User } from "lucide-react";
import Sidebar from "../components/Sidebar";
import styles from "./Chat.module.css";
import axios from "axios";

// -----------------------------
// Types
// -----------------------------
interface Conversation {
  id: number;
  student_id: number;
  counselor_id: number;
  is_active: boolean;
  created_at: string;
}

interface ChatMessage {
  id: number;
  conversation_id: number;
  sender_id: number;   // ✅ numeric user id
  content: string;
  created_at: string;
}


// -----------------------------
// Component
// -----------------------------
export default function Chat() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeConversation, setActiveConversation] = useState<number | null>(
    null
  );
  const [newMessage, setNewMessage] = useState("");

  // ⚡ Change this for logged-in user (student/counselor)
// ⚡ Temporary hardcoded user (counselor dashboard)
const userId = 24; // put your counselor's user_id from the DB
const userRole: "counselor" | "counselor" = "counselor";


  // Fetch conversations
  useEffect(() => {
    axios
      .get<Conversation[]>(`http://localhost:8001/api/conversations`, {
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
        `http://localhost:8001/api/conversations/${activeConversation}/messages`
      )
      .then((res) => setMessages(res.data))
      .catch((err) => console.error("Error fetching messages:", err));
  }, [activeConversation]);

// Handle send
const handleSend = () => {
  if (!newMessage.trim() || !activeConversation) return;
  axios
    .post<ChatMessage>(
      `http://localhost:8001/api/conversations/${activeConversation}/messages`,
      {
        sender_id: userId,   // ✅ numeric sender_id
        content: newMessage,
      }
    )
    .then((res) => {
      setMessages((prev) => [...prev, res.data]);
      setNewMessage("");
    })
    .catch((err) => console.error("Error sending message:", err));
};


  const currentConversation = conversations.find(
    (c) => c.id === activeConversation
  );

  return (
    <div className="flex bg-[#f5f5f5] min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-64">
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
                          Conversation #{c.id}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-lg capitalize ${
                            c.is_active
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-200 text-gray-600"
                          }`}
                        >
                          {c.is_active ? "open" : "ended"}
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
                      <h2 className="font-semibold text-[#0d8c4f] text-lg">
                        Conversation #{currentConversation.id}
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
                              ? "bg-[#2563eb] text-white ml-auto rounded-br-md" // current user (counselor)
                              : "bg-gray-100 text-[#333] mr-auto rounded-bl-md" // other side (student)
                          }`}
                        >
                          <p>{m.content}</p>
                          <small className="block text-xs opacity-75 mt-1">
                            {new Date(m.created_at).toLocaleTimeString([], {
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
                        placeholder="Type your message..."
                        className="flex-1 border rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-[#0d8c4f]"
                      />
                      <button
                        onClick={handleSend}
                        className="bg-[#0d8c4f] text-white rounded-xl px-4 flex items-center gap-2 hover:bg-[#0b6d3f] transition"
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
