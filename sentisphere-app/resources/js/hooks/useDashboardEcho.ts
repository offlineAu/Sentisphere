/**
 * useDashboardEcho - React hook for real-time dashboard updates via Pusher
 * 
 * This hook subscribes to Pusher events and triggers the onStatsUpdate callback
 * when new data arrives, allowing the parent component to refresh its data.
 * 
 * Usage:
 * ```tsx
 * const { connected, lastUpdate } = useDashboardEcho({
 *   onStatsUpdate: () => refetchDashboardData(),
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

interface UseDashboardEchoOptions {
  /** Auto-connect on mount (default: true) */
  autoConnect?: boolean;
  /** Initial date range filter */
  initialRange?: string;
  /** Callback when stats are updated - triggers parent to refresh */
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

  // Trigger refresh - calls the parent's callback
  const triggerRefresh = useCallback(() => {
    setLastUpdate(new Date());
    // Call with empty stats to signal refresh needed
    onStatsUpdateRef.current?.({} as DashboardStats);
  }, []);

  // Change date range
  const changeRange = useCallback((newRange: string) => {
    setRange(newRange);
  }, []);

  // Initialize Pusher and subscribe to dashboard channel
  useEffect(() => {
    if (!autoConnect) return;

    const pusherKey = (import.meta as any).env?.VITE_PUSHER_APP_KEY;
    const pusherCluster = (import.meta as any).env?.VITE_PUSHER_APP_CLUSTER || 'ap1';

    // If Pusher is not configured, no real-time updates (parent handles its own polling)
    if (!pusherKey) {
      console.log('[Dashboard] Pusher not configured');
      return;
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

      // Listen for new checkin events - trigger parent refresh
      channel.bind('new_checkin', () => {
        console.log('[Dashboard] New checkin - triggering refresh');
        triggerRefresh();
      });

      // Listen for new journal events
      channel.bind('new_journal', () => {
        console.log('[Dashboard] New journal - triggering refresh');
        triggerRefresh();
      });

      // Listen for new alert events
      channel.bind('new_alert', () => {
        console.log('[Dashboard] New alert - triggering refresh');
        triggerRefresh();
      });

      // Listen for general stats update
      channel.bind('stats_update', () => {
        console.log('[Dashboard] Stats update - triggering refresh');
        triggerRefresh();
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
    }
  }, [autoConnect, triggerRefresh]);

  return {
    connected,
    lastUpdate,
    range,
    refresh: triggerRefresh,
    setRange: changeRange,
  };
}

export default useDashboardEcho;
