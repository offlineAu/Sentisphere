import { useDashboardEcho } from '@/hooks/useDashboardEcho';
import type { DashboardStats as EchoDashboardStats } from '@/hooks/useDashboardEcho';

// Re-export DashboardStats to keep type compatibility
export type DashboardStats = EchoDashboardStats;

// Keep the original options shape but map to Echo options
export interface UseDashboardSocketOptions {
  autoConnect?: boolean;
  initialRange?: string;
  onStatsUpdate?: (stats: DashboardStats) => void;
  onConnectionChange?: (connected: boolean) => void;
}

// Thin wrapper around useDashboardEcho so existing imports keep working
export function useDashboardSocket(options: UseDashboardSocketOptions = {}) {
  const { autoConnect = true, initialRange = 'this_week', onStatsUpdate, onConnectionChange } = options;

  return useDashboardEcho({
    autoConnect,
    initialRange,
    onStatsUpdate,
    onConnectionChange,
  });
}

export default useDashboardSocket;
