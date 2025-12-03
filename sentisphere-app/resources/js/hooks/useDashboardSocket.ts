import { useEffect, useRef, useCallback, useState } from 'react';

export interface DashboardStats {
  students_monitored: number;
  this_week_checkins: number;
  open_appointments: number;
  high_risk_flags: number;
  recent_alerts: Array<{
    id: number;
    name: string;
    severity: string;
    status: string;
    reason?: string;
    created_at: string | null;
  }>;
  timestamp: string;
}

interface DashboardEvent {
  type: 'connected' | 'stats_update' | 'pong' | 'error';
  message?: string;
  stats?: DashboardStats;
  ts?: string;
}

interface UseDashboardSocketOptions {
  /** Auto-connect on mount (default: true) */
  autoConnect?: boolean;
  /** Reconnect delay in ms (default: 3000) */
  reconnectDelay?: number;
  /** Max reconnect attempts (default: 5) */
  maxReconnectAttempts?: number;
  /** Initial date range filter */
  initialRange?: string;
  /** Callback when stats are updated */
  onStatsUpdate?: (stats: DashboardStats) => void;
  /** Callback on connection state change */
  onConnectionChange?: (connected: boolean) => void;
}

export function useDashboardSocket(options: UseDashboardSocketOptions = {}) {
  const {
    autoConnect = true,
    reconnectDelay = 3000,
    maxReconnectAttempts = 5,
    initialRange = 'this_week',
    onStatsUpdate,
    onConnectionChange,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const [connected, setConnected] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const getToken = useCallback((): string | null => {
    // Try to get token from session storage first
    const sessionToken = sessionStorage.getItem('fastapi_token');
    if (sessionToken) return sessionToken;

    // Fallback: try localStorage
    const localToken = localStorage.getItem('token');
    if (localToken) return localToken;

    // Try auth_token as well
    const authToken = localStorage.getItem('auth_token');
    if (authToken) return authToken;

    return null;
  }, []);

  const connect = useCallback(() => {
    const token = getToken();
    if (!token) {
      console.warn('[useDashboardSocket] No auth token available');
      return;
    }

    // Build WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const port = import.meta.env.DEV ? ':8010' : '';
    const wsUrl = `${protocol}//${host}${port}/ws/dashboard?token=${encodeURIComponent(token)}`;

    try {
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('[useDashboardSocket] Connected');
        setConnected(true);
        reconnectAttempts.current = 0;
        onConnectionChange?.(true);

        // Start ping interval to keep connection alive
        pingInterval.current = setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ action: 'ping' }));
          }
        }, 25000);
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data: DashboardEvent = JSON.parse(event.data);
          
          if (data.type === 'connected' && data.stats) {
            console.log('[useDashboardSocket] Initial stats received');
            setStats(data.stats);
            setLastUpdate(new Date());
            onStatsUpdate?.(data.stats);
          } else if (data.type === 'stats_update' && data.stats) {
            console.log('[useDashboardSocket] Stats update received');
            setStats(data.stats);
            setLastUpdate(new Date());
            onStatsUpdate?.(data.stats);
          } else if (data.type === 'pong') {
            // Heartbeat response, connection is alive
          }
        } catch (e) {
          console.error('[useDashboardSocket] Failed to parse message:', e);
        }
      };

      wsRef.current.onclose = (event) => {
        console.log('[useDashboardSocket] Disconnected:', event.code, event.reason);
        setConnected(false);
        onConnectionChange?.(false);

        // Clear ping interval
        if (pingInterval.current) {
          clearInterval(pingInterval.current);
          pingInterval.current = null;
        }

        // Attempt reconnect if not a clean close
        if (event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
          reconnectTimer.current = setTimeout(() => {
            reconnectAttempts.current++;
            console.log(`[useDashboardSocket] Reconnecting... attempt ${reconnectAttempts.current}`);
            connect();
          }, reconnectDelay);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('[useDashboardSocket] Error:', error);
      };
    } catch (e) {
      console.error('[useDashboardSocket] Failed to create WebSocket:', e);
    }
  }, [getToken, onStatsUpdate, onConnectionChange, reconnectDelay, maxReconnectAttempts]);

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    if (pingInterval.current) {
      clearInterval(pingInterval.current);
      pingInterval.current = null;
    }
    reconnectAttempts.current = maxReconnectAttempts; // Prevent auto-reconnect
    if (wsRef.current) {
      wsRef.current.close(1000, 'Client disconnect');
      wsRef.current = null;
    }
    setConnected(false);
  }, [maxReconnectAttempts]);

  /**
   * Request an immediate stats refresh
   */
  const refresh = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'refresh' }));
    }
  }, []);

  /**
   * Update the date range filter
   */
  const setRange = useCallback((range: string, start?: string | null, end?: string | null) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        action: 'set_range',
        range,
        start: start || null,
        end: end || null,
      }));
    }
  }, []);

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
    stats,
    lastUpdate,
    connect,
    disconnect,
    refresh,
    setRange,
  };
}

export default useDashboardSocket;
