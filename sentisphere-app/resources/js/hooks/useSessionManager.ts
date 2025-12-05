/**
 * useSessionManager - React hook for automatic logout on JWT expiration or inactivity
 * 
 * Features:
 * - Monitors JWT token expiration
 * - Tracks user activity (mouse, keyboard, touch, scroll)
 * - Auto-logout after 60 minutes of inactivity
 * - Shows warning before logout
 * - Handles 401 responses from API
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { router } from '@inertiajs/react';
import { logoutFastApi, sessionStatus } from '@/lib/auth';

// Configuration
const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes
const WARNING_BEFORE_LOGOUT_MS = 5 * 60 * 1000; // Show warning 5 minutes before logout
const SESSION_CHECK_INTERVAL_MS = 60 * 1000; // Check session every minute
const TOKEN_CHECK_INTERVAL_MS = 30 * 1000; // Check token expiry every 30 seconds

interface UseSessionManagerOptions {
  /** Enable session management (default: true) */
  enabled?: boolean;
  /** Callback when session expires */
  onSessionExpired?: () => void;
  /** Callback when showing logout warning */
  onLogoutWarning?: (remainingMs: number) => void;
}

interface SessionManagerState {
  isActive: boolean;
  showWarning: boolean;
  remainingTime: number;
  lastActivity: Date;
}

// Parse JWT to get expiration time
function parseJwtExpiration(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload.exp ? payload.exp * 1000 : null; // Convert to milliseconds
  } catch {
    return null;
  }
}

// Check if token is expired or about to expire
function isTokenExpired(token: string, bufferMs: number = 30000): boolean {
  const exp = parseJwtExpiration(token);
  if (!exp) return true;
  return Date.now() >= exp - bufferMs;
}

export function useSessionManager(options: UseSessionManagerOptions = {}) {
  const { enabled = true, onSessionExpired, onLogoutWarning } = options;

  const [state, setState] = useState<SessionManagerState>({
    isActive: true,
    showWarning: false,
    remainingTime: INACTIVITY_TIMEOUT_MS,
    lastActivity: new Date(),
  });

  const lastActivityRef = useRef<number>(Date.now());
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimerRef = useRef<NodeJS.Timeout | null>(null);
  const sessionCheckRef = useRef<NodeJS.Timeout | null>(null);
  const tokenCheckRef = useRef<NodeJS.Timeout | null>(null);
  const isLoggingOutRef = useRef(false);

  // Perform logout
  const performLogout = useCallback(async (reason: string = 'session_expired') => {
    if (isLoggingOutRef.current) return;
    isLoggingOutRef.current = true;

    console.log(`[SessionManager] Logging out: ${reason}`);
    
    try {
      await logoutFastApi();
    } catch {
      // Ignore errors during logout
    }

    // Clear all timers
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (sessionCheckRef.current) clearInterval(sessionCheckRef.current);
    if (tokenCheckRef.current) clearInterval(tokenCheckRef.current);

    onSessionExpired?.();
    
    // Redirect to login with reason
    router.visit(`/login?reason=${reason}`);
  }, [onSessionExpired]);

  // Reset activity timer
  const resetActivityTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    
    setState(prev => ({
      ...prev,
      isActive: true,
      showWarning: false,
      remainingTime: INACTIVITY_TIMEOUT_MS,
      lastActivity: new Date(),
    }));

    // Clear existing timers
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);

    // Set warning timer (5 minutes before logout)
    warningTimerRef.current = setTimeout(() => {
      setState(prev => ({ ...prev, showWarning: true }));
      onLogoutWarning?.(WARNING_BEFORE_LOGOUT_MS);
    }, INACTIVITY_TIMEOUT_MS - WARNING_BEFORE_LOGOUT_MS);

    // Set logout timer
    inactivityTimerRef.current = setTimeout(() => {
      performLogout('inactivity');
    }, INACTIVITY_TIMEOUT_MS);
  }, [performLogout, onLogoutWarning]);

  // Check JWT token validity
  const checkTokenValidity = useCallback(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      performLogout('no_token');
      return false;
    }

    if (isTokenExpired(token)) {
      performLogout('token_expired');
      return false;
    }

    return true;
  }, [performLogout]);

  // Check session with backend
  const checkSession = useCallback(async () => {
    try {
      const status = await sessionStatus();
      if (!status.authenticated) {
        performLogout('session_invalid');
        return false;
      }
      return true;
    } catch {
      // Network error - don't logout, might be temporary
      return true;
    }
  }, [performLogout]);

  // Activity event handler (throttled)
  const handleActivity = useCallback(() => {
    const now = Date.now();
    // Throttle: only reset if more than 1 second since last activity
    if (now - lastActivityRef.current > 1000) {
      resetActivityTimer();
    }
  }, [resetActivityTimer]);

  // Set up event listeners and timers
  useEffect(() => {
    if (!enabled) return;

    // Skip on login page
    if (typeof window !== 'undefined' && window.location.pathname === '/login') {
      return;
    }

    // Check if we have a token
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    // Initial token check
    if (!checkTokenValidity()) return;

    // Set up activity listeners
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // Start activity timer
    resetActivityTimer();

    // Set up periodic session check
    sessionCheckRef.current = setInterval(() => {
      checkSession();
    }, SESSION_CHECK_INTERVAL_MS);

    // Set up periodic token check
    tokenCheckRef.current = setInterval(() => {
      checkTokenValidity();
    }, TOKEN_CHECK_INTERVAL_MS);

    // Update remaining time every second when warning is shown
    const remainingTimeInterval = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      const remaining = Math.max(0, INACTIVITY_TIMEOUT_MS - elapsed);
      setState(prev => ({ ...prev, remainingTime: remaining }));
    }, 1000);

    // Cleanup
    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
      
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      if (sessionCheckRef.current) clearInterval(sessionCheckRef.current);
      if (tokenCheckRef.current) clearInterval(tokenCheckRef.current);
      clearInterval(remainingTimeInterval);
    };
  }, [enabled, handleActivity, resetActivityTimer, checkSession, checkTokenValidity]);

  // Listen for 401 responses (interceptor-style)
  useEffect(() => {
    if (!enabled) return;

    const handleUnauthorized = (event: CustomEvent) => {
      performLogout('unauthorized');
    };

    window.addEventListener('auth:unauthorized' as any, handleUnauthorized);
    return () => {
      window.removeEventListener('auth:unauthorized' as any, handleUnauthorized);
    };
  }, [enabled, performLogout]);

  return {
    ...state,
    resetActivity: resetActivityTimer,
    logout: () => performLogout('manual'),
    formatRemainingTime: () => {
      const minutes = Math.floor(state.remainingTime / 60000);
      const seconds = Math.floor((state.remainingTime % 60000) / 1000);
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    },
  };
}

export default useSessionManager;
