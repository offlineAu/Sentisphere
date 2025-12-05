/**
 * Conversation Store - Simple global state management using a singleton pattern
 * This avoids external dependencies while providing reactive state updates
 */

export type ApiMessage = {
  message_id: number;
  conversation_id: number;
  sender_id: number;
  content: string;
  is_read: boolean;
  timestamp: string;
};

export type ApiConversation = {
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

type Listener = () => void;

class ConversationStore {
  private conversations: ApiConversation[] = [];
  private isLoading: boolean = true;
  private listeners: Set<Listener> = new Set();

  // Subscribe to changes
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Notify all listeners
  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }

  // Getters
  getConversations(): ApiConversation[] {
    return this.conversations;
  }

  getIsLoading(): boolean {
    return this.isLoading;
  }

  // Setters with notification
  setConversations(conversations: ApiConversation[]): void {
    this.conversations = conversations;
    this.notify();
  }

  setLoading(loading: boolean): void {
    this.isLoading = loading;
    this.notify();
  }

  addConversation(conversation: ApiConversation): void {
    this.conversations = [conversation, ...this.conversations];
    this.notify();
  }

  updateConversation(conversationId: number, updates: Partial<ApiConversation>): void {
    this.conversations = this.conversations.map((c) =>
      c.conversation_id === conversationId ? { ...c, ...updates } : c
    );
    this.notify();
  }

  deleteConversation(conversationId: number): void {
    this.conversations = this.conversations.filter((c) => c.conversation_id !== conversationId);
    this.notify();
  }

  closeConversation(conversationId: number): void {
    this.updateConversation(conversationId, { status: 'ended' });
  }

  reopenConversation(conversationId: number): void {
    this.updateConversation(conversationId, { status: 'open' });
  }

  /**
   * Mark all messages in a conversation as read (optimistic update)
   * Used when user opens a conversation
   */
  markConversationAsRead(conversationId: number): void {
    this.conversations = this.conversations.map((c) => {
      if (c.conversation_id === conversationId && c.messages) {
        return {
          ...c,
          messages: c.messages.map((m) => ({ ...m, is_read: true })),
        };
      }
      return c;
    });
    this.notify();
  }

  /**
   * Check if a conversation has unread messages for a given user
   */
  hasUnreadMessages(conversationId: number, currentUserId: number): boolean {
    const conv = this.conversations.find((c) => c.conversation_id === conversationId);
    if (!conv?.messages) return false;
    return conv.messages.some((m) => !m.is_read && m.sender_id !== currentUserId);
  }
}

// Singleton instance
export const conversationStore = new ConversationStore();
