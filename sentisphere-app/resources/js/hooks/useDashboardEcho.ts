/**
 * useDashboardEcho - React hook for real-time dashboard updates via Laravel Echo + Pusher
 * 
 * This replaces useDashboardSocket.ts with Laravel's native broadcasting system.
 * 
 * Usage:
 * ```tsx
 * const { stats, connected, lastUpdate, refresh } = useDashboardEcho({
 *   onStatsUpdate: (stats) => console.log('Got update:', stats),
 * });
 * ```
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import echoInstance from '@/lib/echo';

// Type the echo instance properly
const echo = echoInstance as {
  channel: (name: string) => {
    listen: (event: string, callback: (data: any) => void) => void;
    stopListening: (event: string) => void;
  };
  leaveChannel: (name: string) => void;
  connector?: { pusher?: any };
} | null;

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
  type: 'stats_update';
  stats: DashboardStats;
  reason: string;
  timestamp: string;
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

  // Refs to avoid stale closures
  const onStatsUpdateRef = useRef(onStatsUpdate);
  const onConnectionChangeRef = useRef(onConnectionChange);

  useEffect(() => {
    onStatsUpdateRef.current = onStatsUpdate;
    onConnectionChangeRef.current = onConnectionChange;
  }, [onStatsUpdate, onConnectionChange]);

  // Fetch initial stats from Laravel
  const fetchInitialStats = useCallback(async () => {
    try {
      const response = await fetch(`/api/dashboard/current?range=${range}`);
      if (response.ok) {
        const data = await response.json();
        setStats(data);
        setLastUpdate(new Date());
        onStatsUpdateRef.current?.(data);
        console.log('[DashboardEcho] Initial stats loaded');
      }
    } catch (error) {
      console.error('[DashboardEcho] Failed to fetch initial stats:', error);
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

  // Subscribe to Echo channel (if available) or just fetch stats
  useEffect(() => {
    if (!autoConnect) {
      return;
    }

    // Always fetch initial stats
    fetchInitialStats();

    // If Echo is not available, just use HTTP polling fallback
    if (!echo) {
      console.log('[DashboardEcho] Echo not available, using 5s polling');
      // Poll every 5 seconds as fallback (Pusher will be instant when enabled)
      const pollInterval = setInterval(() => {
        fetchInitialStats();
      }, 5000);
      return () => clearInterval(pollInterval);
    }

    // Subscribe to dashboard channel
    const channel = echo.channel('dashboard');

    // Listen for DashboardUpdated events
    channel.listen('.DashboardUpdated', (event: DashboardEvent) => {
      console.log('[DashboardEcho] Received update:', event.reason);
      
      if (event.stats) {
        setStats(event.stats);
        setLastUpdate(new Date());
        onStatsUpdateRef.current?.(event.stats);
      }
    });

    // Track connection state via Pusher
    const pusher = (echo as any).connector?.pusher;
    if (pusher) {
      pusher.connection.bind('connected', () => {
        console.log('[DashboardEcho] ✓ Connected to Pusher');
        setConnected(true);
        onConnectionChangeRef.current?.(true);
      });

      pusher.connection.bind('disconnected', () => {
        console.log('[DashboardEcho] Disconnected from Pusher');
        setConnected(false);
        onConnectionChangeRef.current?.(false);
      });

      pusher.connection.bind('error', (error: any) => {
        console.error('[DashboardEcho] Pusher error:', error);
      });

      // Check initial state
      if (pusher.connection.state === 'connected') {
        setConnected(true);
        onConnectionChangeRef.current?.(true);
      }
    }

    // Cleanup
    return () => {
      channel.stopListening('.DashboardUpdated');
      echo.leaveChannel('dashboard');
    };
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
