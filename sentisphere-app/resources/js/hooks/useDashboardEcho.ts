/**
 * useDashboardEcho - React hook for real-time dashboard updates via Pusher
 * 
 * This provides instant updates for dashboard stats when data changes.
 * 
 * Usage:
 * ```tsx
 * const { stats, connected, lastUpdate, refresh } = useDashboardEcho({
 *   onStatsUpdate: (stats) => console.log('Got update:', stats),
 * });
 * ```
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import Pusher from 'pusher-js';

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
  range?: string;
}

interface DashboardEvent {
  type: string;
  stats?: DashboardStats;
  reason?: string;
  timestamp?: string;
}

interface UseDashboardEchoOptions {
  /** Auto-connect on mount (default: true) */
  autoConnect?: boolean;
  /** Initial date range filter */
  initialRange?: string;
  /** Callback when stats are updated */
  onStatsUpdate?: (stats: DashboardStats) => void;
  /** Callback on connection state change */
  onConnectionChange?: (connected: boolean) => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useDashboardEcho(options: UseDashboardEchoOptions = {}) {
  const {
    autoConnect = true,
    initialRange = 'this_week',
    onStatsUpdate,
    onConnectionChange,
  } = options;

  const [connected, setConnected] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [range, setRange] = useState(initialRange);
  const pusherRef = useRef<Pusher | null>(null);
  const channelRef = useRef<any>(null);

  // Refs to avoid stale closures
  const onStatsUpdateRef = useRef(onStatsUpdate);
  const onConnectionChangeRef = useRef(onConnectionChange);

  useEffect(() => {
    onStatsUpdateRef.current = onStatsUpdate;
    onConnectionChangeRef.current = onConnectionChange;
  }, [onStatsUpdate, onConnectionChange]);

  // Fetch initial stats from API
  const fetchInitialStats = useCallback(async () => {
    try {
      const response = await fetch(`/api/dashboard/current?range=${range}`);
      if (response.ok) {
        const data = await response.json();
        setStats(data);
        setLastUpdate(new Date());
        onStatsUpdateRef.current?.(data);
        console.log('[Dashboard] Stats loaded');
      }
    } catch (error) {
      console.error('[Dashboard] Failed to fetch stats:', error);
    }
  }, [range]);

  // Refresh stats manually
  const refresh = useCallback(() => {
    fetchInitialStats();
  }, [fetchInitialStats]);

  // Change date range
  const changeRange = useCallback((newRange: string) => {
    setRange(newRange);
  }, []);

  // Initialize Pusher and subscribe to dashboard channel
  useEffect(() => {
    if (!autoConnect) return;

    // Always fetch initial stats
    fetchInitialStats();

    const pusherKey = (import.meta as any).env?.VITE_PUSHER_APP_KEY;
    const pusherCluster = (import.meta as any).env?.VITE_PUSHER_APP_CLUSTER || 'ap1';

    // If Pusher is not configured, use polling fallback
    if (!pusherKey) {
      console.log('[Dashboard] Pusher not configured, using 5s polling');
      const pollInterval = setInterval(() => {
        fetchInitialStats();
      }, 5000);
      return () => clearInterval(pollInterval);
    }

    try {
      const pusher = new Pusher(pusherKey, {
        cluster: pusherCluster,
      });
      pusherRef.current = pusher;

      // Track connection state
      pusher.connection.bind('connected', () => {
        console.log('[Dashboard] ✓ Pusher connected');
        setConnected(true);
        onConnectionChangeRef.current?.(true);
      });

      pusher.connection.bind('disconnected', () => {
        console.log('[Dashboard] Pusher disconnected');
        setConnected(false);
        onConnectionChangeRef.current?.(false);
      });

      pusher.connection.bind('error', (err: any) => {
        console.error('[Dashboard] Pusher error:', err);
      });

      // Subscribe to dashboard channel
      const channel = pusher.subscribe('dashboard');
      channelRef.current = channel;

      // Listen for dashboard update events
      channel.bind('stats_update', (data: DashboardEvent) => {
        console.log('[Dashboard] Pusher update received:', data.reason);
        if (data.stats) {
          setStats(data.stats);
          setLastUpdate(new Date());
          onStatsUpdateRef.current?.(data.stats);
        } else {
          // If no stats in event, refresh from API
          fetchInitialStats();
        }
      });

      // Listen for new checkin events
      channel.bind('new_checkin', () => {
        console.log('[Dashboard] New checkin - refreshing');
        fetchInitialStats();
      });

      // Listen for new journal events
      channel.bind('new_journal', () => {
        console.log('[Dashboard] New journal - refreshing');
        fetchInitialStats();
      });

      // Listen for new alert events
      channel.bind('new_alert', () => {
        console.log('[Dashboard] New alert - refreshing');
        fetchInitialStats();
      });

      return () => {
        channel.unbind_all();
        pusher.unsubscribe('dashboard');
        pusher.disconnect();
        pusherRef.current = null;
        channelRef.current = null;
      };
    } catch (e) {
      console.error('[Dashboard] Pusher init failed:', e);
      // Fallback to polling
      const pollInterval = setInterval(() => {
        fetchInitialStats();
      }, 5000);
      return () => clearInterval(pollInterval);
    }
  }, [autoConnect, fetchInitialStats]);

  // Refetch when range changes
  useEffect(() => {
    if (autoConnect) {
      fetchInitialStats();
    }
  }, [range, autoConnect, fetchInitialStats]);

  return {
    connected,
    stats,
    lastUpdate,
    range,
    refresh,
    setRange: changeRange,
  };
}

export default useDashboardEcho;
