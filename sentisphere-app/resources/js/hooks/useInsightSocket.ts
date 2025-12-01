import { useEffect, useRef, useCallback, useState } from 'react';

interface InsightEvent {
  type: 'insight_generated' | 'insight_updated' | 'connected' | 'error';
  insight_type?: 'weekly' | 'behavioral';
  user_id?: number | null;
  timeframe_start?: string;
  timeframe_end?: string;
  risk_level?: string;
  generated_at?: string;
  message?: string;
}

interface UseInsightSocketOptions {
  /** Auto-connect on mount (default: true) */
  autoConnect?: boolean;
  /** Reconnect delay in ms (default: 3000) */
  reconnectDelay?: number;
  /** Max reconnect attempts (default: 5) */
  maxReconnectAttempts?: number;
  /** Callback when insight is generated/updated */
  onInsight?: (event: InsightEvent) => void;
  /** Callback on connection state change */
  onConnectionChange?: (connected: boolean) => void;
}

export function useInsightSocket(options: UseInsightSocketOptions = {}) {
  const {
    autoConnect = true,
    reconnectDelay = 3000,
    maxReconnectAttempts = 5,
    onInsight,
    onConnectionChange,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<NodeJS.Timeout | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<InsightEvent | null>(null);

  const getToken = useCallback((): string | null => {
    // Try to get token from session storage or cookie
    const sessionToken = sessionStorage.getItem('fastapi_token');
    if (sessionToken) return sessionToken;

    // Fallback: try localStorage
    const localToken = localStorage.getItem('token');
    if (localToken) return localToken;

    return null;
  }, []);

  const connect = useCallback(() => {
    const token = getToken();
    if (!token) {
      console.warn('[useInsightSocket] No auth token available');
      return;
    }

    // Build WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const port = import.meta.env.DEV ? ':8010' : '';
    const wsUrl = `${protocol}//${host}${port}/ws/insights?token=${encodeURIComponent(token)}`;

    try {
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('[useInsightSocket] Connected');
        setConnected(true);
        reconnectAttempts.current = 0;
        onConnectionChange?.(true);
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data: InsightEvent = JSON.parse(event.data);
          setLastEvent(data);
          
          if (data.type === 'insight_generated' || data.type === 'insight_updated') {
            onInsight?.(data);
          }
        } catch (e) {
          console.error('[useInsightSocket] Failed to parse message:', e);
        }
      };

      wsRef.current.onclose = (event) => {
        console.log('[useInsightSocket] Disconnected:', event.code, event.reason);
        setConnected(false);
        onConnectionChange?.(false);

        // Attempt reconnect if not a clean close
        if (event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
          reconnectTimer.current = setTimeout(() => {
            reconnectAttempts.current++;
            console.log(`[useInsightSocket] Reconnecting... attempt ${reconnectAttempts.current}`);
            connect();
          }, reconnectDelay);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('[useInsightSocket] Error:', error);
      };
    } catch (e) {
      console.error('[useInsightSocket] Failed to create WebSocket:', e);
    }
  }, [getToken, onInsight, onConnectionChange, reconnectDelay, maxReconnectAttempts]);

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    reconnectAttempts.current = maxReconnectAttempts; // Prevent auto-reconnect
    if (wsRef.current) {
      wsRef.current.close(1000, 'Client disconnect');
      wsRef.current = null;
    }
    setConnected(false);
  }, [maxReconnectAttempts]);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    connected,
    lastEvent,
    connect,
    disconnect,
  };
}

/**
 * Simpler SSE-based hook for insight updates (fallback if WebSocket unavailable)
 */
export function useInsightSSE(options: {
  onInsight?: (data: any) => void;
  autoConnect?: boolean;
} = {}) {
  const { onInsight, autoConnect = true } = options;
  const eventSourceRef = useRef<EventSource | null>(null);
  const [connected, setConnected] = useState(false);

  const connect = useCallback(() => {
    const token = sessionStorage.getItem('fastapi_token') || localStorage.getItem('token');
    if (!token) {
      console.warn('[useInsightSSE] No auth token available');
      return;
    }

    const baseUrl = import.meta.env.DEV ? 'http://localhost:8010' : '';
    const sseUrl = `${baseUrl}/api/events/insights?token=${encodeURIComponent(token)}`;

    try {
      eventSourceRef.current = new EventSource(sseUrl);

      eventSourceRef.current.onopen = () => {
        console.log('[useInsightSSE] Connected');
        setConnected(true);
      };

      eventSourceRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onInsight?.(data);
        } catch (e) {
          console.error('[useInsightSSE] Failed to parse:', e);
        }
      };

      eventSourceRef.current.onerror = () => {
        console.error('[useInsightSSE] Error/disconnect');
        setConnected(false);
        eventSourceRef.current?.close();
      };
    } catch (e) {
      console.error('[useInsightSSE] Failed to connect:', e);
    }
  }, [onInsight]);

  const disconnect = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setConnected(false);
  }, []);

  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    return () => disconnect();
  }, [autoConnect, connect, disconnect]);

  return { connected, connect, disconnect };
}

export default useInsightSocket;
