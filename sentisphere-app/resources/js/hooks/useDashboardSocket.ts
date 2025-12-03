import { useEffect, useRef, useCallback, useState } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface DashboardStats {
  students_monitored: number;
  this_week_checkins: number;
  open_appointments: number;
  high_risk_flags: number;
  recent_alerts?: Array<{
    id: number;
    name: string;
    severity: string;
    status: string;
    reason?: string;
    created_at: string | null;
  }>;
  timestamp?: string;
}

interface DashboardEvent {
  type: 'connected' | 'stats_update' | 'pong' | 'error';
  message?: string;
  stats?: DashboardStats;
  ts?: string;
}

interface UseDashboardSocketOptions {
  autoConnect?: boolean;
  onStatsUpdate?: (stats: DashboardStats) => void;
  onConnectionChange?: (connected: boolean) => void;
}

// ============================================================================
// Singleton WebSocket Manager (prevents multiple connections)
// ============================================================================

class DashboardSocketManager {
  private static instance: DashboardSocketManager | null = null;
  
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private isConnecting = false;
  private isIntentionalClose = false;
  
  // Listeners
  private statsListeners = new Set<(stats: DashboardStats) => void>();
  private connectionListeners = new Set<(connected: boolean) => void>();
  
  // Config
  private readonly MAX_RECONNECT_ATTEMPTS = 10;
  private readonly BASE_RECONNECT_DELAY = 1000; // 1 second
  private readonly MAX_RECONNECT_DELAY = 30000; // 30 seconds
  private readonly PING_INTERVAL = 25000; // 25 seconds
  
  private constructor() {}
  
  static getInstance(): DashboardSocketManager {
    if (!DashboardSocketManager.instance) {
      DashboardSocketManager.instance = new DashboardSocketManager();
    }
    return DashboardSocketManager.instance;
  }
  
  // -------------------------------------------------------------------------
  // Listener Management
  // -------------------------------------------------------------------------
  
  addStatsListener(callback: (stats: DashboardStats) => void): void {
    this.statsListeners.add(callback);
  }
  
  removeStatsListener(callback: (stats: DashboardStats) => void): void {
    this.statsListeners.delete(callback);
  }
  
  addConnectionListener(callback: (connected: boolean) => void): void {
    this.connectionListeners.add(callback);
  }
  
  removeConnectionListener(callback: (connected: boolean) => void): void {
    this.connectionListeners.delete(callback);
  }
  
  private notifyStats(stats: DashboardStats): void {
    this.statsListeners.forEach(cb => {
      try { cb(stats); } catch (e) { console.error('[DashboardSocket] Listener error:', e); }
    });
  }
  
  private notifyConnection(connected: boolean): void {
    this.connectionListeners.forEach(cb => {
      try { cb(connected); } catch (e) { console.error('[DashboardSocket] Listener error:', e); }
    });
  }
  
  // -------------------------------------------------------------------------
  // Connection Management
  // -------------------------------------------------------------------------
  
  private getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem('fastapi_token') 
      || localStorage.getItem('auth_token') 
      || localStorage.getItem('token') 
      || null;
  }
  
  private buildWsUrl(token: string): string {
    if (window.location.hostname.includes('railway.app')) {
      return `wss://sentisphere.up.railway.app/ws/dashboard?token=${encodeURIComponent(token)}`;
    } else if (import.meta.env.DEV) {
      return `ws://localhost:8010/ws/dashboard?token=${encodeURIComponent(token)}`;
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${protocol}//${window.location.hostname}:8010/ws/dashboard?token=${encodeURIComponent(token)}`;
    }
  }
  
  private getReconnectDelay(): number {
    // Exponential backoff with jitter
    const delay = Math.min(
      this.BASE_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts),
      this.MAX_RECONNECT_DELAY
    );
    const jitter = delay * 0.2 * Math.random();
    return delay + jitter;
  }
  
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
  
  connect(): void {
    // Prevent multiple simultaneous connection attempts
    if (this.isConnecting || this.isConnected()) {
      return;
    }
    
    const token = this.getToken();
    if (!token) {
      console.warn('[DashboardSocket] No auth token available');
      return;
    }
    
    this.isConnecting = true;
    this.isIntentionalClose = false;
    
    const wsUrl = this.buildWsUrl(token);
    console.log('[DashboardSocket] Connecting to:', wsUrl.replace(/token=.*/, 'token=***'));
    
    try {
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('[DashboardSocket] ✓ Connected');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.notifyConnection(true);
        
        // Request initial stats
        this.refresh();
        
        // Start ping interval
        this.startPing();
      };
      
      this.ws.onmessage = (event) => {
        try {
          const data: DashboardEvent = JSON.parse(event.data);
          
          if ((data.type === 'connected' || data.type === 'stats_update') && data.stats) {
            console.log('[DashboardSocket] Stats received:', data.type);
            this.notifyStats(data.stats);
          }
          // Pong is just a heartbeat acknowledgment, no action needed
        } catch (e) {
          console.error('[DashboardSocket] Parse error:', e);
        }
      };
      
      this.ws.onclose = (event) => {
        console.log('[DashboardSocket] Disconnected:', event.code, event.reason || '');
        this.isConnecting = false;
        this.stopPing();
        this.notifyConnection(false);
        
        // Don't reconnect if intentionally closed
        if (this.isIntentionalClose) {
          console.log('[DashboardSocket] Intentional close, not reconnecting');
          return;
        }
        
        // Schedule reconnect with exponential backoff
        if (this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
          const delay = this.getReconnectDelay();
          console.log(`[DashboardSocket] Reconnecting in ${Math.round(delay/1000)}s (attempt ${this.reconnectAttempts + 1}/${this.MAX_RECONNECT_ATTEMPTS})`);
          
          this.reconnectTimer = setTimeout(() => {
            this.reconnectAttempts++;
            this.connect();
          }, delay);
        } else {
          console.warn('[DashboardSocket] Max reconnection attempts reached. Call connect() manually to retry.');
          // Reset attempts so manual reconnect works
          this.reconnectAttempts = 0;
        }
      };
      
      this.ws.onerror = () => {
        // Error details are not available in browser, just log occurrence
        console.error('[DashboardSocket] Connection error');
        this.isConnecting = false;
      };
      
    } catch (e) {
      console.error('[DashboardSocket] Failed to create WebSocket:', e);
      this.isConnecting = false;
    }
  }
  
  disconnect(): void {
    this.isIntentionalClose = true;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    this.stopPing();
    
    if (this.ws) {
      try {
        this.ws.close(1000, 'Client disconnect');
      } catch (e) {
        // Ignore close errors
      }
      this.ws = null;
    }
    
    this.reconnectAttempts = 0;
    this.notifyConnection(false);
  }
  
  // -------------------------------------------------------------------------
  // Ping/Pong Keepalive
  // -------------------------------------------------------------------------
  
  private startPing(): void {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      if (this.isConnected()) {
        try {
          this.ws!.send(JSON.stringify({ action: 'ping' }));
        } catch (e) {
          console.error('[DashboardSocket] Ping failed:', e);
        }
      }
    }, this.PING_INTERVAL);
  }
  
  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
  
  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------
  
  refresh(): void {
    if (this.isConnected()) {
      try {
        this.ws!.send(JSON.stringify({ action: 'refresh' }));
        console.log('[DashboardSocket] Refresh requested');
      } catch (e) {
        console.error('[DashboardSocket] Refresh failed:', e);
      }
    }
  }
  
  setRange(range: string, start?: string | null, end?: string | null): void {
    if (this.isConnected()) {
      try {
        this.ws!.send(JSON.stringify({
          action: 'set_range',
          range,
          start: start || null,
          end: end || null,
        }));
      } catch (e) {
        console.error('[DashboardSocket] Set range failed:', e);
      }
    }
  }
}

// ============================================================================
// React Hook
// ============================================================================

export function useDashboardSocket(options: UseDashboardSocketOptions = {}) {
  const { autoConnect = true, onStatsUpdate, onConnectionChange } = options;
  
  const [connected, setConnected] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  
  // Keep refs to avoid stale closures
  const onStatsUpdateRef = useRef(onStatsUpdate);
  const onConnectionChangeRef = useRef(onConnectionChange);
  
  useEffect(() => {
    onStatsUpdateRef.current = onStatsUpdate;
    onConnectionChangeRef.current = onConnectionChange;
  }, [onStatsUpdate, onConnectionChange]);
  
  // Get singleton manager
  const manager = DashboardSocketManager.getInstance();
  
  useEffect(() => {
    // Stats listener
    const handleStats = (newStats: DashboardStats) => {
      setStats(newStats);
      setLastUpdate(new Date());
      onStatsUpdateRef.current?.(newStats);
    };
    
    // Connection listener
    const handleConnection = (isConnected: boolean) => {
      setConnected(isConnected);
      onConnectionChangeRef.current?.(isConnected);
    };
    
    // Register listeners
    manager.addStatsListener(handleStats);
    manager.addConnectionListener(handleConnection);
    
    // Set initial state
    setConnected(manager.isConnected());
    
    // Auto-connect if enabled
    if (autoConnect) {
      manager.connect();
    }
    
    // Cleanup: remove listeners (but don't disconnect - other components may be using it)
    return () => {
      manager.removeStatsListener(handleStats);
      manager.removeConnectionListener(handleConnection);
    };
  }, [autoConnect, manager]);
  
  // Stable callbacks
  const connect = useCallback(() => manager.connect(), [manager]);
  const disconnect = useCallback(() => manager.disconnect(), [manager]);
  const refresh = useCallback(() => manager.refresh(), [manager]);
  const setRange = useCallback(
    (range: string, start?: string | null, end?: string | null) => manager.setRange(range, start, end),
    [manager]
  );
  
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
