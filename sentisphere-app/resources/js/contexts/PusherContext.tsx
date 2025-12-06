import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import Pusher, { Channel } from 'pusher-js';
import api from '@/lib/api';

// Types
interface Message {
  message_id: number;
  conversation_id: number;
  sender_id: number;
  content: string;
  is_read: boolean;
  timestamp: string;
}

interface ConversationStatus {
  conversation_id: number;
  status: 'open' | 'ended';
}

interface TypingEvent {
  conversation_id: number;
  user_id: number;
  user_name: string;
  is_typing: boolean;
}

interface PusherContextType {
  // State
  unreadCount: number;
  typingUsers: Map<number, { user_id: number; user_name: string; timeout: NodeJS.Timeout }>;
  conversationStatuses: Map<number, 'open' | 'ended'>;
  
  // Actions
  refreshUnreadCount: () => Promise<void>;
  markConversationRead: (conversationId: number) => Promise<void>;
  sendTypingIndicator: (conversationId: number, isTyping: boolean) => void;
  subscribeToConversation: (conversationId: number) => Channel | null;
  unsubscribeFromConversation: (conversationId: number) => void;
  
  // Event callbacks (set by Chat component)
  onNewMessage: React.MutableRefObject<((msg: Message) => void) | null>;
  onMessageRead: React.MutableRefObject<((conversationId: number) => void) | null>;
  onStatusChange: React.MutableRefObject<((data: ConversationStatus) => void) | null>;
  
  // Connection state
  isConnected: boolean;
}

const PusherContext = createContext<PusherContextType | null>(null);

// Pusher configuration
const PUSHER_KEY = import.meta.env.VITE_PUSHER_APP_KEY || 'your-pusher-key';
const PUSHER_CLUSTER = import.meta.env.VITE_PUSHER_APP_CLUSTER || 'ap1';
const TYPING_TIMEOUT = 3000; // 3 seconds
const STATUS_POLL_INTERVAL = 10000; // 10 seconds fallback polling for faster status updates

export function PusherProvider({ children }: { children: React.ReactNode }) {
  const pusherRef = useRef<Pusher | null>(null);
  const globalChannelRef = useRef<Channel | null>(null);
  const conversationChannelsRef = useRef<Map<number, Channel>>(new Map());
  const statusPollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const [unreadCount, setUnreadCount] = useState(0);
  const [typingUsers, setTypingUsers] = useState<Map<number, { user_id: number; user_name: string; timeout: NodeJS.Timeout }>>(new Map());
  const [conversationStatuses, setConversationStatuses] = useState<Map<number, 'open' | 'ended'>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  
  // Callbacks that can be set by Chat component
  const onNewMessage = useRef<((msg: Message) => void) | null>(null);
  const onMessageRead = useRef<((conversationId: number) => void) | null>(null);
  const onStatusChange = useRef<((data: ConversationStatus) => void) | null>(null);

  // Fetch unread count
  const refreshUnreadCount = useCallback(async () => {
    try {
      const res = await api.get<{ unread_count?: number; count?: number }>('/counselor/conversations/unread-count');
      const count = res.data?.unread_count ?? res.data?.count ?? 0;
      setUnreadCount(count);
    } catch (err) {
      console.error('[Pusher] Failed to fetch unread count:', err);
    }
  }, []);

  // Mark conversation as read
  const markConversationRead = useCallback(async (conversationId: number) => {
    try {
      await api.post(`/counselor/conversations/${conversationId}/read`);
      await refreshUnreadCount();
    } catch (err) {
      console.error('[Pusher] Failed to mark conversation read:', err);
    }
  }, [refreshUnreadCount]);

  // Send typing indicator
  const sendTypingIndicator = useCallback((conversationId: number, isTyping: boolean) => {
    try {
      api.post(`/counselor/conversations/${conversationId}/typing`, { is_typing: isTyping });
    } catch (err) {
      console.error('[Pusher] Failed to send typing indicator:', err);
    }
  }, []);

  // Handle typing event
  const handleTypingEvent = useCallback((data: TypingEvent) => {
    setTypingUsers(prev => {
      const newMap = new Map(prev);
      
      if (data.is_typing) {
        // Clear existing timeout
        const existing = newMap.get(data.conversation_id);
        if (existing?.timeout) {
          clearTimeout(existing.timeout);
        }
        
        // Set new timeout to auto-clear typing indicator
        const timeout = setTimeout(() => {
          setTypingUsers(p => {
            const updated = new Map(p);
            updated.delete(data.conversation_id);
            return updated;
          });
        }, TYPING_TIMEOUT);
        
        newMap.set(data.conversation_id, {
          user_id: data.user_id,
          user_name: data.user_name,
          timeout,
        });
      } else {
        const existing = newMap.get(data.conversation_id);
        if (existing?.timeout) {
          clearTimeout(existing.timeout);
        }
        newMap.delete(data.conversation_id);
      }
      
      return newMap;
    });
  }, []);

  // Poll conversation statuses as fallback
  const pollConversationStatuses = useCallback(async () => {
    try {
      const res = await api.get<Array<{ conversation_id: number; status: 'open' | 'ended' }>>('/counselor/conversations');
      const conversations = res.data || [];
      
      setConversationStatuses(prev => {
        const newMap = new Map(prev);
        let hasChanges = false;
        
        conversations.forEach((conv: any) => {
          const oldStatus = prev.get(conv.conversation_id);
          if (oldStatus !== conv.status) {
            newMap.set(conv.conversation_id, conv.status);
            hasChanges = true;
            
            // Trigger callback if status changed
            if (oldStatus !== undefined && onStatusChange.current) {
              onStatusChange.current({
                conversation_id: conv.conversation_id,
                status: conv.status,
              });
            }
          }
        });
        
        return hasChanges ? newMap : prev;
      });
    } catch (err) {
      console.error('[Pusher] Failed to poll statuses:', err);
    }
  }, []);

  // Subscribe to a specific conversation channel
  const subscribeToConversation = useCallback((conversationId: number): Channel | null => {
    if (!pusherRef.current) return null;
    
    const existingChannel = conversationChannelsRef.current.get(conversationId);
    if (existingChannel) return existingChannel;
    
    const channelName = `conversation-${conversationId}`;
    const channel = pusherRef.current.subscribe(channelName);
    
    channel.bind('message', (data: any) => {
      console.log('[Pusher] Message received on conversation channel:', data);
      if (data?.message && onNewMessage.current) {
        onNewMessage.current(data.message);
      }
    });
    
    channel.bind('typing', (data: any) => {
      console.log('[Pusher] Typing event:', data);
      if (data) {
        handleTypingEvent({
          conversation_id: conversationId,
          user_id: data.user_id,
          user_name: data.user_name || 'User',
          is_typing: data.is_typing,
        });
      }
    });
    
    channel.bind('read', (data: any) => {
      console.log('[Pusher] Read receipt:', data);
      if (onMessageRead.current) {
        onMessageRead.current(conversationId);
      }
    });
    
    channel.bind('status', (data: any) => {
      console.log('[Pusher] Status change on conversation channel:', data);
      if (data?.status) {
        setConversationStatuses(prev => {
          const newMap = new Map(prev);
          newMap.set(conversationId, data.status);
          return newMap;
        });
        if (onStatusChange.current) {
          onStatusChange.current({
            conversation_id: conversationId,
            status: data.status,
          });
        }
      }
    });
    
    conversationChannelsRef.current.set(conversationId, channel);
    return channel;
  }, [handleTypingEvent]);

  // Unsubscribe from conversation channel
  const unsubscribeFromConversation = useCallback((conversationId: number) => {
    const channel = conversationChannelsRef.current.get(conversationId);
    if (channel && pusherRef.current) {
      pusherRef.current.unsubscribe(`conversation-${conversationId}`);
      conversationChannelsRef.current.delete(conversationId);
    }
  }, []);

  // Initialize Pusher on mount
  useEffect(() => {
    // Skip if no Pusher key configured
    if (!PUSHER_KEY || PUSHER_KEY === 'your-pusher-key') {
      console.log('[Pusher] No valid Pusher key configured, skipping initialization');
      return;
    }

    // Create Pusher instance
    pusherRef.current = new Pusher(PUSHER_KEY, {
      cluster: PUSHER_CLUSTER,
      forceTLS: true,
    });

    // Connection state handling
    pusherRef.current.connection.bind('connected', () => {
      console.log('[Pusher] Connected');
      setIsConnected(true);
    });

    pusherRef.current.connection.bind('disconnected', () => {
      console.log('[Pusher] Disconnected');
      setIsConnected(false);
    });

    pusherRef.current.connection.bind('error', (err: any) => {
      console.error('[Pusher] Connection error:', err);
    });

    // Subscribe to global conversations channel
    globalChannelRef.current = pusherRef.current.subscribe('conversations');
    
    // Global new message event - updates badge count
    globalChannelRef.current.bind('new_message', (data: any) => {
      console.log('[Pusher] Global new_message event:', data);
      refreshUnreadCount();
      
      // Also trigger the callback if set (for real-time message updates)
      if (data?.message && onNewMessage.current) {
        onNewMessage.current(data.message);
      }
    });
    
    // New conversation event
    globalChannelRef.current.bind('new_conversation', (data: any) => {
      console.log('[Pusher] New conversation:', data);
      refreshUnreadCount();
    });
    
    // Messages read event
    globalChannelRef.current.bind('messages_read', (data: any) => {
      console.log('[Pusher] Messages read:', data);
      refreshUnreadCount();
      if (data?.conversation_id && onMessageRead.current) {
        onMessageRead.current(data.conversation_id);
      }
    });
    
    // Status changed event (global)
    globalChannelRef.current.bind('status_changed', (data: any) => {
      console.log('[Pusher] Status changed (global):', data);
      if (data?.conversation_id && data?.status) {
        setConversationStatuses(prev => {
          const newMap = new Map(prev);
          newMap.set(data.conversation_id, data.status);
          return newMap;
        });
        if (onStatusChange.current) {
          onStatusChange.current(data);
        }
      }
    });

    // Initial fetch
    refreshUnreadCount();
    pollConversationStatuses();

    // Start status polling as fallback
    statusPollIntervalRef.current = setInterval(pollConversationStatuses, STATUS_POLL_INTERVAL);

    // Cleanup
    return () => {
      if (statusPollIntervalRef.current) {
        clearInterval(statusPollIntervalRef.current);
      }
      
      // Clear typing timeouts
      typingUsers.forEach(({ timeout }) => clearTimeout(timeout));
      
      // Unsubscribe from all conversation channels
      conversationChannelsRef.current.forEach((_, conversationId) => {
        pusherRef.current?.unsubscribe(`conversation-${conversationId}`);
      });
      conversationChannelsRef.current.clear();
      
      // Unsubscribe from global channel
      if (pusherRef.current) {
        pusherRef.current.unsubscribe('conversations');
        pusherRef.current.disconnect();
      }
    };
  }, [refreshUnreadCount, pollConversationStatuses]);

  // Handle visibility change - refresh when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[Pusher] Tab became visible, refreshing...');
        refreshUnreadCount();
        pollConversationStatuses();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [refreshUnreadCount, pollConversationStatuses]);

  const value: PusherContextType = {
    unreadCount,
    typingUsers,
    conversationStatuses,
    refreshUnreadCount,
    markConversationRead,
    sendTypingIndicator,
    subscribeToConversation,
    unsubscribeFromConversation,
    onNewMessage,
    onMessageRead,
    onStatusChange,
    isConnected,
  };

  return (
    <PusherContext.Provider value={value}>
      {children}
    </PusherContext.Provider>
  );
}

export function usePusher() {
  const context = useContext(PusherContext);
  if (!context) {
    throw new Error('usePusher must be used within a PusherProvider');
  }
  return context;
}

// Hook for just the unread count (for Sidebar)
export function useUnreadCount() {
  const { unreadCount } = usePusher();
  return unreadCount;
}

// Hook for typing indicator
export function useTypingIndicator(conversationId: number) {
  const { typingUsers, sendTypingIndicator } = usePusher();
  const typingData = typingUsers.get(conversationId);
  
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const setTyping = useCallback((isTyping: boolean) => {
    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    sendTypingIndicator(conversationId, isTyping);
    
    // Auto-stop typing after timeout
    if (isTyping) {
      typingTimeoutRef.current = setTimeout(() => {
        sendTypingIndicator(conversationId, false);
      }, TYPING_TIMEOUT);
    }
  }, [conversationId, sendTypingIndicator]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);
  
  return {
    isTyping: !!typingData,
    typingUserName: typingData?.user_name,
    setTyping,
  };
}

// Hook for conversation status
export function useConversationStatus(conversationId: number) {
  const { conversationStatuses } = usePusher();
  return conversationStatuses.get(conversationId);
}
