import { useEffect, useState, useRef, useMemo, ReactElement, useCallback } from "react";
import axios from "axios";
import { ChevronLeft, ChevronRight, Info, Users, CalendarCheck, CalendarClock, AlertTriangle, AlertCircle, Bell, Search, Mail, Percent as PercentIcon, Hash as HashIcon, User, Filter, Lightbulb } from "lucide-react";
import { motion } from "framer-motion";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  BarChart,
  Bar,
  LabelList,
  Cell,
} from "recharts";
import { useSidebar } from "../components/SidebarContext";
import DashboardLayout from "../layouts/DashboardLayout";
import styles from './CounselorDashboard.module.css';
import api from "../lib/api";
import { parseApiError } from "@/lib/error-handler";
import { LoadingSpinner } from "../components/loading-spinner";
import { sessionStatus } from "../lib/auth";
import { router } from "@inertiajs/react";
import { useDashboardSocket, type DashboardStats } from "@/hooks";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

// Format date to be more readable (e.g., "October 23, 2023 3:58 PM")
const formatDate = (dateString: string | Date, includeTime = false) => {
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  };
  
  if (includeTime) {
    options.hour = 'numeric';
    options.minute = '2-digit';
    options.hour12 = true;
  }
  
  return date.toLocaleString('en-US', options);
};

// -----------------------------
// Types
// -----------------------------
type StudentRisk = "low" | "medium" | "high";

// Removed Appointment interface (Upcoming Appointments section deprecated)

interface MoodPoint {
  week: string;
  avgMood: number;
}

interface SentimentBreakdown {
  name: string;
  value: number;
}

interface StudentFlag {
  id: string;
  name: string;
  program: string;
  lastCheckIn: string;
  risk: StudentRisk;
  signals: string[];
}

// Custom XAxis tick component with proper TypeScript types
import { SVGProps } from 'react';

const XAxisTick = (props: {
  x?: number;
  y?: number;
  payload?: {
    value: string | number;
    [key: string]: any;
  };
} & SVGProps<SVGTextElement>) => {
  const { x = 0, y = 0, payload, ...rest } = props;

  if (!payload) {
    return <text x={x} y={y} {...rest} />;
  }

  // Split the label into words
  const words = String(payload.value).split(' ');
  const isTwoWords = words.length === 2;
  const isThreeWords = words.length === 3;

  // Calculate text width to adjust positioning
  const textLength = String(payload.value).length;
  const xOffset = -10; // Adjust this value to move text left/right
  
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={xOffset}
        y={0}
        dy={isTwoWords ? 30 : isThreeWords ? 40 : 20}
        textAnchor="end"
        fill="#666"
        style={{
          fontSize: 10,
          textTransform: 'capitalize',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
        {...rest}
      >
        {words[0]}
        {isTwoWords && (
          <tspan x={xOffset} dy="1.2em" textAnchor="end">{words[1]}</tspan>
        )}
        {isThreeWords && (
          <>
            <tspan x={xOffset} dy="1.2em" textAnchor="end">{words[1]}</tspan>
            <tspan x={xOffset} dy="1.2em" textAnchor="end">{words[2]}</tspan>
          </>
        )}
      </text>
    </g>
  );
};

// -----------------------------
// Components
// -----------------------------
const riskBadge = (risk: StudentRisk) => {
  const color =
    risk === "high"
      ? "bg-red-100 text-red-700"
      : risk === "medium"
      ? "bg-yellow-100 text-yellow-700"
      : "bg-muted text-primary"; // palette for low risk
  return (
    <span className={`px-2 py-1 rounded-lg text-xs font-medium ${color}`}>
      {risk}
    </span>
  );
};

const severityBadge = (severity: string) => {
  let color = "";
  if (severity === "high" || severity === "critical") color = "bg-red-100 text-red-700";
  else if (severity === "medium") color = "bg-yellow-100 text-yellow-700";
  else color = "bg-blue-100 text-blue-700";
  return (
    <span className={`ml-1 px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {severity.charAt(0).toUpperCase() + severity.slice(1)}
    </span>
  );
};

const StatCard: React.FC<{
  title: string;
  value: string | number;
  icon: React.ReactNode;
  delta?: string;
  variant?: 'default' | 'appointments' | 'risk' | 'checkins';
  customGradient?: string;
  isLive?: boolean;
  tooltip?: string;
}> = ({ title, value, icon, delta, variant = 'default', customGradient, isLive = false, tooltip }) => {
  const getGradient = () => {
    if (customGradient) {
      return `bg-gradient-to-br ${customGradient} border border-transparent`;
    }
    
    switch(variant) {
      case 'appointments':
        return 'bg-gradient-to-br from-amber-300 to-amber-500 border border-amber-300';
      case 'risk':
        return 'bg-gradient-to-br from-rose-400 to-rose-600 border border-rose-400';
      case 'checkins':
        return 'bg-gradient-to-br from-sky-400 to-sky-600 border border-sky-400';
      default:
        return 'bg-gradient-to-br from-emerald-500 to-emerald-600 border border-emerald-400';
    }
  };

  const getTextColor = (variant: 'default' | 'appointments' | 'risk' | 'checkins' = 'default'): string => {
    switch (variant) {
      case 'appointments': // amber (yellow tone)
        return 'text-amber-950'; // dark text if gradient is bright
      case 'risk': // rose (red tone)
        return 'text-white'; // best contrast
      case 'checkins': // sky (blue tone)
        return 'text-white'; // crisp and readable
      default: // emerald (green tone)
        return 'text-white';
    }
  };

  const getIconBgColor = (variant: 'default' | 'appointments' | 'risk' | 'checkins' = 'default') => {
    switch(variant) {
      case 'appointments':
        return 'bg-yellow-500/30';
      case 'risk':
        return 'bg-red-500/30';
      case 'checkins':
        return 'bg-blue-500/30';
      default:
        return 'bg-emerald-500/30';
    }
  };

  const cardContent = (
    <div className={`${getGradient()} rounded-2xl shadow p-5 hover:shadow-md transition-all duration-300 h-full relative group cursor-default`}>
      {/* Live indicator */}
      {isLive && (
        <div className="absolute top-2 right-2 flex items-center gap-1">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
          </span>
        </div>
      )}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-white">
          {title}
        </h3>
        <div className={`p-2 rounded-lg ${getIconBgColor()}`}>
          <div className={getTextColor()}>
            {icon}
          </div>
        </div>
      </div>
      <div className="text-2xl font-bold text-white">
        {value}
      </div>
      {delta && (
        <div className="mt-2 text-xs flex items-center text-white/90">
          <ChevronRight className="h-3 w-3 text-white" /> {delta}
        </div>
      )}
    </div>
  );

  if (!tooltip) return cardContent;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {cardContent}
      </TooltipTrigger>
      <TooltipContent 
        side="bottom"
        className="bg-gradient-to-br from-slate-800 to-slate-900 text-white border border-slate-700 shadow-xl max-w-xs text-xs leading-relaxed px-3 py-2.5 rounded-lg"
      >
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
};

// AI summary generator (simple version for demo)
const getMoodSummary = (data: any[]) => {
  if (!data.length) return "No mood data available for this period.";
  const avg = data.reduce((sum, d) => sum + d.avgMood, 0) / data.length;
  if (avg >= 6.5) return "Overall, students are feeling very positive and motivated this period.";
  if (avg >= 5.5) return "Students are generally in a good mood, with some positive trends.";
  if (avg >= 4.5) return "Mood is mixed. Some students may be experiencing stress or challenges.";
  if (avg > 0) return "Many students are struggling emotionally this period.";
  return "No mood data available for this period.";
};


// User profile type
type UserProfile = {
  id: number;
  name: string;
  email: string;
  role?: string;
  created_at?: string;
};

// -----------------------------
// Main Dashboard
// -----------------------------
export default function CounselorDashboard() {
  const { open } = useSidebar();
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [moodTrend, setMoodTrend] = useState<any[]>([]);
  const [sentimentBreakdown, setSentimentBreakdown] = useState<any[]>([]);
  const [checkinBreakdown, setCheckinBreakdown] = useState<{ mood: any[]; energy: any[]; stress: any[] } | null>(null);
  const [appointmentLogs, setAppointmentLogs] = useState<any[]>([]);
  const [appointmentPage, setAppointmentPage] = useState(0);
  const APPOINTMENTS_PER_PAGE = 5;
  const [recentAlerts, setRecentAlerts] = useState<any[]>([]);
  const [allAlerts, setAllAlerts] = useState<any[]>([]);
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const [studentsMonitored, setStudentsMonitored] = useState(0);
  const [openAppointments, setOpenAppointments] = useState(0);
  const [sentimentPeriod, setSentimentPeriod] = useState<"week" | "month" | "year">("month");
  const [page, setPage] = useState(0);
  const [showMoodInfo, setShowMoodInfo] = useState(false);
  const [highRiskFlags, setHighRiskFlags] = useState(0);
  const [thisWeekCheckins, setThisWeekCheckins] = useState(0);
  const [counselor, setCounselor] = useState<any | null>(null);
  // AI summaries (optional: fetched from backend if available)
  const [aiSentimentSummary, setAiSentimentSummary] = useState<string | null>(null);
  const [aiMoodSummary, setAiMoodSummary] = useState<string | null>(null);
  const [aiCheckinSummary, setAICheckinSummary] = useState('');
  const [showAISummary, setShowAISummary] = useState(false);
  const [showScaleInfo, setShowScaleInfo] = useState(false);
  const [showSentimentInfo, setShowSentimentInfo] = useState(false);
  // Persisted label mode for Check-in Breakdown: 'count' | 'percent'
  const [checkinLabelMode, setCheckinLabelMode] = useState<'count' | 'percent'>(() => {
    const v = localStorage.getItem('checkinLabelMode');
    return (v === 'percent' || v === 'count') ? v : 'count';
  });
  useEffect(() => {
    localStorage.setItem('checkinLabelMode', checkinLabelMode);
  }, [checkinLabelMode]);
  // Messages unread count (UI badge only; wire up when API is available)
  const [unreadMessages, setUnreadMessages] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // Derive Open Appointments from appointment logs for the current week (unique students who downloaded appointment form)
  useEffect(() => {
    if (!Array.isArray(appointmentLogs) || appointmentLogs.length === 0) {
      setOpenAppointments(0);
      return;
    }
    try {
      const now = new Date();
      const day = now.getDay(); // 0=Sun..6=Sat
      const mondayOffset = day === 0 ? -6 : 1 - day; // Monday as start
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() + mondayOffset);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);

      const isInCurrentWeek = (dt: string) => {
        const d = new Date(dt);
        return d >= weekStart && d < weekEnd;
      };

      const uniqueUsers = new Set<number | string>();
      appointmentLogs.forEach((log: any) => {
        const label = String(log?.form_type || '').toLowerCase();
        const isAppointmentForm = /appointment/.test(label);
        if (!isAppointmentForm) return;
        const ts = log?.downloaded_at || log?.created_at;
        if (!ts || !isInCurrentWeek(String(ts))) return;
        uniqueUsers.add(log?.user_id ?? `${log?.user_id}`);
      });
      setOpenAppointments(uniqueUsers.size);
    } catch {
      // fallback
      setOpenAppointments(0);
    }
  }, [appointmentLogs]);

  // Global date filter state (Counselor dashboard scope)
  const [globalRange, setGlobalRange] = useState<
    'this_week' | 'last_week' | 'last_30d' | 'this_month' | 'this_semester' | 'custom'
  >('this_week');
  const [rangeStart, setRangeStart] = useState<string>('');
  const [rangeEnd, setRangeEnd] = useState<string>('');
  const filterParams = useMemo(
    () => (
      globalRange === 'custom' && rangeStart && rangeEnd
        ? { range: 'custom', start: rangeStart, end: rangeEnd }
        : { range: globalRange }
    ),
    [globalRange, rangeStart, rangeEnd]
  );

  // WebSocket for instant notifications - triggers data refresh
  // Use refs to avoid recreating callbacks and causing infinite loops
  const handleStatsUpdate = useCallback((_stats: DashboardStats) => {
    console.log('[Dashboard] WebSocket notification - refreshing data');
    setRefreshKey(prev => prev + 1);
  }, []);

  const handleConnectionChange = useCallback((connected: boolean) => {
    console.log('[Dashboard] WebSocket:', connected ? 'connected' : 'disconnected');
  }, []);

  const {
    connected: wsConnected,
    lastUpdate: wsLastUpdate,
  } = useDashboardSocket({
    autoConnect: authenticated,
    onStatsUpdate: handleStatsUpdate,
    onConnectionChange: handleConnectionChange,
  });

  const moodScale = [
    { value: 1, label: 'Terrible' },
    { value: 2, label: 'Bad' },
    { value: 3, label: 'Upset' },
    { value: 4, label: 'Anxious' },
    { value: 5, label: 'Meh' },
    { value: 6, label: 'Okay' },
    { value: 7, label: 'Great' },
    { value: 8, label: 'Loved' },
    { value: 9, label: 'Awesome' },
  ];

  const labelForScore = (v: number) => {
    const found = moodScale.find((m) => m.value === Math.round(v));
    return found ? found.label : String(v);
  };

  // Check session authentication and redirect if needed
  useEffect(() => {
    let mounted = true;
    sessionStatus().then(s => {
      if (!mounted) return;
      if (s?.authenticated) {
        setAuthenticated(true);
      } else {
        router.visit('/login');
      }
    });
    return () => { mounted = false; };
  }, []);

  // Define API response types
  interface ApiResponse<T> {
    data: T;
  }

  interface NumericResponse extends ApiResponse<number> {}
  interface ArrayResponse<T> extends ApiResponse<T[]> {}

  // Fetch from backend via Laravel proxy (/api) when authenticated or refreshKey changes
  useEffect(() => {
    if (!authenticated) return;
    
    setLoading(refreshKey === 0); // Only show loading spinner on initial load
    const fetchData = async () => {
      try {
        // Helper function to safely get numeric data
        const getNumericData = async (endpoint: string, params?: Record<string, any>): Promise<number> => {
          try {
            console.log(`[DEBUG] Fetching from ${endpoint}`);
            const response = await api.get<any>(endpoint, params ? { params } : undefined);
            console.log(`[DEBUG] Response from ${endpoint}:`, response);
            
            // Robust extraction: handle {count}, arrays, nested data arrays, totals
            let result = 0;
            const d = (response as any)?.data;
            if (typeof d?.count === 'number') {
              result = Number(d.count) || 0;
            } else if (Array.isArray(d)) {
              result = d.length;
            } else if (Array.isArray(d?.data)) {
              result = d.data.length;
            } else if (typeof d?.total === 'number') {
              result = Number(d.total) || 0;
            } else if (typeof d === 'number') {
              result = d;
            } else if (typeof (response as any) === 'number') {
              result = (response as any);
            } else {
              console.warn(`[DEBUG] Unexpected response format from ${endpoint}:`, response);
              result = 0;
            }
            console.log(`[DEBUG] Final value for ${endpoint}:`, result);
            return result;
          
          } catch (error) {
            console.error(`[ERROR] Error fetching ${endpoint}:`, error);
            return 0;
          }
        };

        // Helper to fetch all pages for endpoints returning paginated arrays
        const fetchAllPaginated = async (
          endpoint: string,
          baseParams?: Record<string, any>
        ): Promise<any[]> => {
          const items: any[] = [];
          let page = 1;
          let lastPage = 1;
          for (let i = 0; i < 50; i++) {
            const res = await api.get<any>(endpoint, {
              params: {
                ...(baseParams || {}),
                page,
                per_page: 100,
                page_size: 100,
                size: 100,
                limit: 100,
              },
            });
            const dataRoot = (res as any)?.data;
            const pageItems = Array.isArray(dataRoot?.data)
              ? dataRoot.data
              : Array.isArray(dataRoot?.items)
              ? dataRoot.items
              : Array.isArray(dataRoot?.results)
              ? dataRoot.results
              : Array.isArray(dataRoot?.logs)
              ? dataRoot.logs
              : Array.isArray(dataRoot?.records)
              ? dataRoot.records
              : Array.isArray(dataRoot?.data?.data)
              ? dataRoot.data.data
              : Array.isArray(dataRoot)
              ? dataRoot
              : [];
            items.push(...pageItems);
            const lpRaw = (
              dataRoot?.last_page ??
              dataRoot?.meta?.last_page ??
              dataRoot?.pagination?.last_page ??
              dataRoot?.data?.last_page ??
              dataRoot?.meta?.pagination?.total_pages ??
              dataRoot?.total_pages
            );
            const hasLast = Number.isFinite(Number(lpRaw));
            if (hasLast) {
              lastPage = Math.max(1, Number(lpRaw));
              if (page >= lastPage) break;
              page += 1;
            } else {
              // If no explicit last_page is provided, continue until an empty page
              if (pageItems.length === 0) break;
              page += 1;
            }
          }
          return items;
        };

        const getAllItemsCount = async (
          endpoint: string,
          baseParams?: Record<string, any>
        ): Promise<number> => {
          const all = await fetchAllPaginated(endpoint, baseParams);
          return all.length;
        };

        // Fetch numeric data in parallel
        const [
          studentsMonitored,
          openAppointments,
          highRiskFlags,
          thisWeekCheckins,
          // Fetch array / structured data
          trendsRes,
          recentAlertsRes,
          allAlertsRes,
          appointmentLogsRes,
        ] = await Promise.all([
          // Time-independent
          getNumericData('/students-monitored'),
          // Open appointments should reflect all currently open items (no date filter)
          getNumericData('/open-appointments', { range: 'all' }),
          getNumericData('/high-risk-flags', filterParams),
          getNumericData('/this-week-checkins', filterParams),
          // Weekly mood analytics should ignore the dashboard's global date filter
          api.get<any>('/reports/trends').catch(() => ({ data: { weeks: [] } })),
          // Recent alerts & logs now respect global date filter
          api.get<ArrayResponse<any>>('/recent-alerts', { params: filterParams }).catch(() => ({ data: [] })),
          api.get<ArrayResponse<any>>('/all-alerts', { params: filterParams }).catch(() => ({ data: [] })),
          api.get<ArrayResponse<any>>('/appointment-logs', { params: { range: 'all', limit: 1000 } }).catch(() => ({ data: [] })),
        ]);

        // Log all numeric states before setting them
        console.log('[DEBUG] Setting numeric states:', {
          studentsMonitored,
          openAppointments,
          highRiskFlags,
          thisWeekCheckins
        });
        
        // Set numeric states
        setStudentsMonitored(studentsMonitored);
        // Open appointments will be derived from appointment logs for the current week
        setHighRiskFlags(highRiskFlags);
        setThisWeekCheckins(thisWeekCheckins);
        
        // Log after state updates (will show in next render)
        setTimeout(() => {
          console.log('[DEBUG] Current states after update (next render):', {
            studentsMonitoredState: studentsMonitored,
            highRiskFlagsState: highRiskFlags,
            thisWeekCheckinsState: thisWeekCheckins,
            openAppointmentsState: openAppointments
          });
        }, 0);

        // Set array states (exclude moodTrend here; trends fetched in a separate effect)
        setRecentAlerts(
          Array.isArray((recentAlertsRes as any)?.data?.data)
            ? (recentAlertsRes as any).data.data
            : Array.isArray((recentAlertsRes as any)?.data)
            ? (recentAlertsRes as any).data
            : []
        );
        setAllAlerts(
          Array.isArray((allAlertsRes as any)?.data?.data)
            ? (allAlertsRes as any).data.data
            : Array.isArray((allAlertsRes as any)?.data)
            ? (allAlertsRes as any).data
            : []
        );
        setAppointmentLogs(
          Array.isArray((appointmentLogsRes as any)?.data?.data)
            ? (appointmentLogsRes as any).data.data
            : Array.isArray((appointmentLogsRes as any)?.data)
            ? (appointmentLogsRes as any).data
            : []
        );
        // Ensure we show ALL logs (aggregate all pages and dedupe)
        try {
          const allLogs = await fetchAllPaginated('/appointment-logs', { range: 'all' });
          if (Array.isArray(allLogs) && allLogs.length) {
            const seen = new Set<string>();
            const unique = allLogs.filter((log: any) => {
              const key = `${log?.log_id ?? ''}-${log?.user_id ?? ''}-${log?.downloaded_at ?? log?.created_at ?? ''}-${log?.form_type ?? ''}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
            setAppointmentLogs(unique);
          }
        } catch (e) {
          console.warn('Failed to fetch all appointment logs', e);
        }
        
        // Add a small delay to ensure all data is rendered before hiding the spinner
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [authenticated, globalRange, rangeStart, rangeEnd, refreshKey]);

  // Refresh data when tab becomes visible (user returns to tab)
  useEffect(() => {
    if (!authenticated) return;
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[Dashboard] Tab visible - refreshing data');
        setRefreshKey(prev => prev + 1);
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [authenticated]);

  // Fallback polling every 30 seconds for real-time updates
  useEffect(() => {
    if (!authenticated) return;
    
    const pollInterval = setInterval(() => {
      console.log('[Dashboard] Polling refresh');
      setRefreshKey(prev => prev + 1);
    }, 5000); // 30 seconds
    
    return () => clearInterval(pollInterval);
  }, [authenticated]);

  // Fetch Weekly Mood Analytics (trends) once, independent of the dashboard global date filter
  useEffect(() => {
    if (!authenticated) return;
    api
      .get<any>('/reports/trends')
      .then((res) => {
        const weeks = Array.isArray(res?.data?.weeks) ? res.data.weeks : [];
        setMoodTrend(weeks);
      })
      .catch(() => setMoodTrend([]));
  }, [authenticated]);

  // Infer first period with data after authentication
  useEffect(() => {
    if (!authenticated) return;
    let isMounted = true;
    getFirstPeriodWithData()
      .then((period) => { if (isMounted) setSentimentPeriod(period); })
      .catch(() => { /* noop */ });
    return () => { isMounted = false; };
  }, [authenticated]);

  // Fetch sentiment breakdown when sentimentPeriod changes (only if authenticated)
  useEffect(() => {
    if (!authenticated) return;
    const params = { period: sentimentPeriod };

    const fetchSentiments = async () => {
      try {
        const r = await api.get<any[]>('/sentiments', { params });
        const data = Array.isArray(r?.data) ? r.data : [];
        setSentimentBreakdown(data);
      } catch (e) {
        console.error(e);
        setSentimentBreakdown([]);
      }
    };

    const fetchCheckinBreakdown = async () => {
      try {
        const r = await api.get<{mood:any[];energy:any[];stress:any[]}>('/checkin-breakdown', { params });
        const payload = r?.data as any;
        setCheckinBreakdown(payload);
      } catch (e) {
        console.error(e);
        setCheckinBreakdown(null);
      }
    };

    fetchSentiments();
    fetchCheckinBreakdown();

    api.get<{summary?: string}>('/ai/sentiment-summary', { params }).then(r=>setAiSentimentSummary(r.data?.summary || null)).catch(()=>setAiSentimentSummary(null));
    api.get<{summary?: string}>('/ai/mood-summary', { params }).then(r=>setAiMoodSummary(r.data?.summary || null)).catch(()=>setAiMoodSummary(null));
  }, [sentimentPeriod, authenticated]);

  // Get user info from token
  useEffect(() => {
    const getUserFromToken = () => {
      try {
        // Get the token from localStorage
        const token = localStorage.getItem('auth_token');
        if (!token) {
          console.warn('No auth token found');
          setLoading(false);
          return;
        }

        // Log the raw token for debugging
        console.log('Raw token:', token);
        
        // Decode the JWT token (middle part is the payload)
        const tokenParts = token.split('.');
        if (tokenParts.length !== 3) {
          console.error('Invalid token format');
          return;
        }
        
        // Safely decode base64 URL
        const base64Url = tokenParts[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(decodeURIComponent(atob(base64).split('').map(function(c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join('')));
        
        console.log('Token payload:', payload);

        // Create user data from token
        const userData: UserProfile = {
          id: parseInt(payload.sub) || 0,
          // Try different possible fields for name and email
          name: payload.name || payload.username || payload.email?.split('@')[0] || 'User',
          email: payload.email || `${payload.sub || 'user'}@example.com`,
          role: payload.role || payload.scope || 'counselor' // Default to counselor if not specified
        };

        console.log('User data from token:', userData);
        setCurrentUser(userData);
      } catch (error) {
        console.error('Error parsing user data from token:', error);
      } finally {
        setLoading(false);
      }
    };

    getUserFromToken();
  }, []);

  // Listen for profile updates to trigger refresh
  useEffect(() => {
    const onProfileUpdated = () => setRefreshKey((v) => v + 1);
    window.addEventListener('profileUpdated', onProfileUpdated);
    return () => {
      window.removeEventListener('profileUpdated', onProfileUpdated);
    };
  }, []);

  // Fetch counselor profile details when authenticated or on refresh
  useEffect(() => {
    if (!authenticated || !currentUser?.id) return;
    api.get<any>('/counselor-profile', { params: { user_id: currentUser.id } })
      .then((res) => setCounselor(res.data))
      .catch(() => setCounselor(null));
  }, [authenticated, currentUser?.id, refreshKey]);

  useEffect(() => {
    if (!counselor || !currentUser) return;
    setCurrentUser((u) => u ? ({
      ...u,
      name: counselor.name || u.name,
      email: counselor.email || u.email,
    }) : u);
  }, [counselor]);

  const parseWeekString = (weekStr: string) => {
    const [yearStr, monthStr, weekLabel] = weekStr.split("-");
    const year = parseInt(yearStr, 10);
    const month = new Date(`${monthStr} 1, ${year}`).getMonth(); // 0-based month
    const week = parseInt(weekLabel.replace(/\D/g, ""), 10);

    return { year, month, week };
  };

  // Sort by end date (latest first). Keep weeks even if avg_mood is null so
  // the current ISO week still appears on the chart with an empty value.
  const sortedMoodTrend = [...moodTrend]
    .filter((entry: any) => entry && typeof entry.week_end === 'string')
    .sort((a: any, b: any) => new Date(b.week_end).getTime() - new Date(a.week_end).getTime());

  const getCurrentWeekString = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.toLocaleString("default", { month: "short" }); // e.g. "Sep"

    // get week number of current month
    const day = today.getDate();
    const week = Math.ceil(day / 7); // 1-5 depending on day of month

    return `${year}-${month}-W${week}`;
  };


  // Paginate (3 per page)
  const itemsPerPage = 3;
  const startIndex = page * itemsPerPage;
  const paginatedMoodTrend = sortedMoodTrend.slice(startIndex, startIndex + itemsPerPage).map((wk: any) => ({
    week: `${new Date(wk.week_start).toLocaleDateString(undefined, { month: 'short', day: '2-digit' })} - ${new Date(wk.week_end).toLocaleDateString(undefined, { month: 'short', day: '2-digit' })}`,
    avgMood: wk.avg_mood,
  }));

  const maxPage = Math.ceil(sortedMoodTrend.length / itemsPerPage) - 1;

  // AI summary for current page (fallback to heuristic if no AI)
  const moodSummary = aiMoodSummary || getMoodSummary(paginatedMoodTrend);

  const DynamicMarginLineChart = ({ data }: any) => {
    const [bottomMargin, setBottomMargin] = useState(30);

    useEffect(() => {
      // Find the longest label in your data (worst case height)
      const longestLabel = data.reduce((max: string, d: any) =>
        d.week.length > max.length ? d.week : max,
      "");
      
      // Estimate text height (two lines = ~40px, more lines = more space)
      const lineCount = longestLabel.split("-").length; 
      setBottomMargin(lineCount * 20); // each line ~20px tall
    }, [data]);

    return (
      <ResponsiveContainer width="100%" height={400}>
        <LineChart
          data={data}
          margin={{ top: 20, right: 30, left: 20, bottom: bottomMargin }}
        >
          <XAxis
            dataKey="week"
            interval={0}
            height={bottomMargin}
            tick={<CustomWeekTick />}
          />
          <YAxis />
          <RTooltip />
          <Line type="monotone" dataKey="mood" stroke="var(--primary)" />
        </LineChart>
      </ResponsiveContainer>
    );
  };

  // Multiline tick for categorical axes to prevent label overlap
  const MultiLineTick = ({ x, y, payload }: any) => {
    const words = String(payload.value).split(' ');
    return (
      <g transform={`translate(${x},${y})`}>
        {words.map((w: string, i: number) => (
          <text
            key={i}
            x={0}
            y={0}
            dy={12 + i * 12}
            textAnchor="middle"
            fill="#6b7280"
            fontSize={11}
          >
            {w}
          </text>
        ))}
      </g>
    );
  };

  const CustomWeekTick = ({ x, y, payload }: any) => {
    const parts = payload.value.split("-");
    return (
      <g transform={`translate(${x},${y})`}>
        {parts.map((p: string, i: number) => (
          <text
            key={i}
            x={0}
            y={0}
            dy={20 + i * 16}
            textAnchor="middle"
            fill="var(--primary)"
            fontSize={12}
          >
            {p}
          </text>
        ))}
      </g>
    );
  };


  // Sentiment period labels
  const periodLabels = {
    week: "This Week",
    month: "This Month",
    year: "This Year",
  };

  // Palette for pie that complements the green theme
  const sentimentColors: Record<string, string> = {
    positive: "#22c55e", // emerald
    negative: "#ef4444", // red-500
    neutral: "#f59e0b",  // amber-500
    mixed: "#10b981",    // teal/emerald blend (not used in chart)
  };

  // Beautiful dark gradient tooltip for charts
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const p0 = payload[0];
      const pl = p0?.payload || {};
      const percent = typeof pl.percent === 'number' ? pl.percent : (typeof p0?.value === 'number' ? p0.value : 0);
      const dataLabel = pl.label || pl.name || label;
      const value = typeof pl.value === 'number' ? pl.value : (typeof p0?.value === 'number' ? p0.value : undefined);
      return (
        <div style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          color: '#fff',
          padding: '10px 14px',
          borderRadius: 10,
          fontSize: 13,
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          border: '1px solid rgba(255,255,255,0.1)',
          minWidth: 120
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4, color: '#e2e8f0' }}>{dataLabel}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ 
              width: 8, 
              height: 8, 
              borderRadius: '50%', 
              background: p0?.color || '#22c55e',
              display: 'inline-block'
            }}></span>
            <span>
              {value !== undefined ? `${value}` : ''} 
              {percent !== undefined && <span style={{ color: '#94a3b8', marginLeft: 4 }}>({percent}%)</span>}
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  // Chart tooltip for line charts (Weekly Mood Analytics)
  const MoodChartTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          color: '#fff',
          padding: '12px 16px',
          borderRadius: 12,
          fontSize: 13,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          border: '1px solid rgba(255,255,255,0.1)',
          minWidth: 140
        }}>
          <div style={{ fontWeight: 600, marginBottom: 8, color: '#e2e8f0', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 6 }}>
            {label}
          </div>
          {payload.map((entry: any, index: number) => (
            <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <span style={{ 
                width: 10, 
                height: 10, 
                borderRadius: '50%', 
                background: entry.color || '#22c55e',
                display: 'inline-block'
              }}></span>
              <span style={{ color: '#cbd5e1' }}>{entry.name || 'Value'}:</span>
              <span style={{ fontWeight: 600 }}>{entry.value?.toFixed?.(1) ?? entry.value}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  const getFirstPeriodWithData = async () => {
    for (const period of ["week", "month", "year"] as const) {
      const { data } = await api.get<any[]>('/sentiments', { params: { period }});
      if (Array.isArray(data) && data.length > 0) return period;
    }
    return "year"; // fallback if all are empty
  };

  // Show loading spinner while data is being fetched
  if (loading) {
    return (
      <div className="flex h-[80vh] w-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <LoadingSpinner size="lg" className="text-primary" />
          <p className="text-muted-foreground">Loading dashboard data...</p>
          <p className="text-xs text-muted-foreground">This may take a few moments</p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
    <div className="flex flex-col min-h-screen">
      <div className="flex-1 pr-8 pl-3 sm:pl-5">
        <div className="flex items-center justify-between p-4">
          <div className="ml-2">
            <h1 className={styles.headerTitle}>Dashboard</h1>
            <p className={styles.headerSubtitle}>
              Overview of student well-being and risk signals.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className={styles.profileChip}>
              <div className={styles.avatarCircle}>
                {currentUser?.name ? (
                  currentUser.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('')
                ) : (
                  <User className="w-5 h-5 text-gray-600" />
                )}
              </div>
              {/* Sentiment Analysis Modal */}
              {showSentimentInfo && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                  <div className="bg-white rounded-2xl shadow-lg p-0 w-full max-w-md border border-gray-100">
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                      <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-100">🧠</span>
                        Sentiment Analysis
                      </h3>
                      <button
                        type="button"
                        className="text-gray-500 hover:text-gray-700 text-xl"
                        onClick={() => setShowSentimentInfo(false)}
                        aria-label="Close"
                      >
                        &times;
                      </button>
                    </div>
                    {/* Body */}
                    <div className="px-5 py-4 max-h-[70vh] overflow-y-auto space-y-4">
                      <p className="text-sm text-gray-600">Here's what we learned about recent check-ins.</p>

                      {(() => {
                        const order = ["positive", "neutral", "negative"] as const;
                        const incoming: Record<string, number> = Object.fromEntries(
                          (Array.isArray(sentimentBreakdown) ? sentimentBreakdown : []).map((d: any) => [String(d.name).toLowerCase(), Number(d.value) || 0])
                        );
                        const total = order.reduce((s, k) => s + (incoming[k] || 0), 0);
                        const percent = (k: typeof order[number]) => {
                          if (total <= 0 || !Number.isFinite(total)) return 0;
                          const value = incoming[k] || 0;
                          if (!Number.isFinite(value)) return 0;
                          return Math.round((value / total) * 100);
                        };
                        const moodKey = Array.from(order).sort((a: typeof order[number], b: typeof order[number]) => (incoming[b] || 0) - (incoming[a] || 0))[0];
                        const label = moodKey === 'positive' ? 'Positive' : moodKey === 'neutral' ? 'Neutral' : 'Negative';
                        const pct = percent(moodKey);
                        const color = moodKey === 'positive' ? 'emerald' : moodKey === 'neutral' ? 'amber' : 'rose';
                        return (
                          <div className={`rounded-xl border ${color==='rose'?'bg-rose-50/60 border-rose-100':'bg-emerald-50/60 border-emerald-100'} ${color==='amber'?'bg-amber-50/60 border-amber-100':''} p-4`}> 
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-xl">{moodKey==='positive'?'😊':moodKey==='neutral'?'😐':'😞'}</span>
                                <div className="font-semibold text-gray-800">Overall Mood</div>
                              </div>
                              <div className="text-sm text-gray-500">Sentiment Score</div>
                            </div>
                            <div className={`mt-1 text-sm ${moodKey==='positive'?'text-emerald-700':moodKey==='neutral'?'text-amber-700':'text-rose-700'}`}>{label}</div>
                            <div className="mt-2 flex items-center gap-2">
                              <div className="relative w-full h-2 rounded-full bg-gray-200 overflow-hidden">
                                <div className={`${moodKey==='positive'?'bg-emerald-500':moodKey==='neutral'?'bg-amber-500':'bg-rose-500'} h-2`} style={{width: `${pct}%`}} />
                              </div>
                              <div className="text-sm font-semibold text-gray-800">{pct}%</div>
                            </div>
                          </div>
                        );
                      })()}

                      <div className="space-y-3">
                        <div className="font-medium text-gray-700 flex items-center gap-2"><span>♡</span> Detected Emotions</div>
                        <div className="flex flex-wrap gap-2">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-600">🙂 joy</span>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="font-medium text-gray-700 flex items-center gap-2"><span>⌁</span> Mood Shift</div>
                        <div className="text-sm text-gray-600">Shift: 0.00</div>
                      </div>

                      <div className="space-y-1">
                        <div className="font-medium text-gray-700 flex items-center gap-2"><span>◎</span> Risk Indicators</div>
                        <div className="text-sm text-gray-600">Score: 0%</div>
                      </div>

                      <div className="space-y-2">
                        <div className="font-medium text-gray-700 flex items-center gap-2"><span>¶</span> Sentence Insights</div>
                        <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">No insights available.</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div>
                <div className={styles.profileName}>
                  {currentUser?.name || 'User'}
                  {currentUser?.role && (
                    <span className="ml-2 text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                      {currentUser.role}
                    </span>
                  )}
                </div>
                <div className={styles.profileEmail}>{currentUser?.email || ''}</div>
              </div>
            </div>
          </div>
        </div>

        {showScaleInfo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md relative">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-primary">Mood Scale</h3>
                <button
                  type="button"
                  className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-800 transition-colors"
                  onClick={() => setShowScaleInfo(false)}
                  aria-label="Close"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>
              <div className="text-sm text-gray-700 space-y-1">
                <div><span className="font-medium">1</span> = Upset</div>
                <div><span className="font-medium">2</span> = Terrible</div>
                <div><span className="font-medium">3</span> = Bad</div>
                <div><span className="font-medium">4</span> = Anxious</div>
                <div><span className="font-medium">5</span> = Meh</div>
                <div><span className="font-medium">6</span> = Okay</div>
                <div><span className="font-medium">7</span> = Loved</div>
                <div><span className="font-medium">8</span> = Great</div>
                <div><span className="font-medium">9</span> = Awesome</div>
              </div>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title="Students Monitored"
            value={studentsMonitored}
            variant="default"
            icon={<Users className="h-4 w-4" />}
            delta={wsLastUpdate ? `Live • ${wsLastUpdate.toLocaleTimeString()}` : `Updated ${formatDate(new Date())}`}
            isLive={wsConnected}
            tooltip="Total number of students who have submitted at least one check-in or journal entry."
          />
          <StatCard
            title="This Week Check-ins"
            value={thisWeekCheckins}
            variant="checkins"
            icon={<CalendarCheck className="h-4 w-4" />}
            delta={wsConnected ? "Real-time" : undefined}
            isLive={wsConnected}
            tooltip="Number of emotional check-ins submitted by students during the current week (Monday to Sunday)."
          />
          <StatCard
            title="Downloaded Appointment Forms"
            value={openAppointments}
            variant="appointments"
            icon={<CalendarClock className="h-4 w-4" />}
            delta={wsConnected ? "Real-time" : undefined}
            isLive={wsConnected}
            tooltip="Count of students who downloaded appointment request forms this week. May indicate students seeking counseling support."
          />
          <StatCard
            title="High-Risk Flags"
            value={highRiskFlags}
            variant="risk"
            icon={<AlertTriangle className="h-4 w-4" />}
            delta={wsConnected ? "Real-time" : undefined}
            isLive={wsConnected}
            tooltip="Students flagged for immediate attention based on negative sentiment patterns, distress keywords, or consecutive low mood scores."
          />
        </div>

        {/* Weekly Mood Analytics - moved up and made more prominent */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6 items-start">
          {/* Weekly Mood Trend (2/3 width on desktop) */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl shadow p-5 hover:shadow-md transition-all duration-300 w-full border border-gray-100">
              <div className={`${styles.cardHeader}`}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2 cursor-help">
                      <h2 className={styles.sectionTitle}>Weekly Mood Analytics</h2>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="bg-gradient-to-br from-slate-800 to-slate-900 text-white border border-slate-700 shadow-xl max-w-xs text-xs leading-relaxed px-3 py-2.5 rounded-lg">
                    Average mood scores per week based on student check-ins. Scale: 1 (Terrible) to 9 (Awesome). Helps identify trends and periods of concern.
                  </TooltipContent>
                </Tooltip>
                <div className="flex items-center gap-2">
                  <button
                    className={`${styles.pill} ${styles.pillSecondary} ${page === 0 ? "opacity-40 cursor-not-allowed" : ""}`}
                    onClick={() => setPage((p) => Math.max(p - 1, 0))}
                    disabled={page === 0}
                  >
                    <ChevronLeft className="h-5 w-5 text-primary" />
                  </button>
                  <button
                    className={`${styles.pill} ${styles.pillSecondary} ${page === maxPage ? "opacity-40 cursor-not-allowed" : ""}`}
                    onClick={() => setPage((p) => Math.min(p + 1, maxPage))}
                    disabled={page === maxPage}
                  >
                    <ChevronRight className="h-5 w-5 text-primary" />
                  </button>
                </div>
              </div>
              {/* AI summary now shown on hover over the info icon in the header */}
              <div className="h-[350px] flex items-center justify-center">
                {paginatedMoodTrend.length === 0 ? (
                  <span className="text-gray-500 text-sm">No mood data available.</span>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={paginatedMoodTrend} margin={{ top: 20, right: 35, bottom: 40, left: 20 }}>
                      <defs>
                        <linearGradient id="moodGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.85} />
                          <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.25} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="week"
                        stroke="var(--primary)"
                        interval={0}
                        tick={({ x, y, payload }) => {
                          const parts = payload.value.split("-");
                          return (
                            <g transform={`translate(${x},${y})`}>
                              {parts.map((p: string, i: number) => (
                                <text
                                  key={i}
                                  x={0}
                                  y={0}
                                  dy={20 + i * 16}
                                  textAnchor="middle"
                                  fill="var(--primary)"
                                  fontSize={12}
                                >
                                  {p}
                                </text>
                              ))}
                            </g>
                          );
                        }}
                      />
                      <YAxis domain={[1, 9]} ticks={[1,2,3,4,5,6,7,8,9]} tickFormatter={(v) => labelForScore(Number(v))} stroke="var(--primary)" />
                      <RTooltip content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          const val = payload[0].value as number;
                          return (
                            <div style={{
                              background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                              color: '#fff',
                              padding: '12px 16px',
                              borderRadius: 12,
                              fontSize: 13,
                              boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              minWidth: 140
                            }}>
                              <div style={{ fontWeight: 600, marginBottom: 8, color: '#e2e8f0', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 6 }}>
                                {label}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ 
                                  width: 10, 
                                  height: 10, 
                                  borderRadius: '50%', 
                                  background: 'var(--primary)',
                                  display: 'inline-block'
                                }}></span>
                                <span style={{ color: '#cbd5e1' }}>Mood Score:</span>
                                <span style={{ fontWeight: 600 }}>{val.toFixed(2)}</span>
                              </div>
                              <div style={{ marginTop: 6, color: '#94a3b8', fontSize: 12 }}>
                                Level: <span style={{ color: '#22c55e', fontWeight: 500 }}>{labelForScore(val)}</span>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }} />
                      <Area
                        type="monotone"
                        dataKey="avgMood"
                        baseValue="dataMin"
                        fill="url(#moodGradient)"
                        stroke="transparent"
                        fillOpacity={1}
                        connectNulls
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotoneX"
                        dataKey="avgMood"
                        stroke="var(--primary)"
                        strokeWidth={3}
                        dot={{ r: 6, stroke: "var(--primary)", strokeWidth: 2, fill: "#fff" }}
                        activeDot={{ r: 8, fill: "var(--primary)" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowScaleInfo(true)}
                className="mt-2 text-xs text-primary underline hover:text-[color-mix(in_oklab,var(--primary),black_15%)] cursor-pointer"
                title="View mood scale"
              >
                View mood scale
              </button>
            </div>
          </div>


          {/* Recent Alerts (1/3 width on desktop) */}
          <div>
            <div className="bg-white rounded-2xl shadow p-4 h-[470px] flex flex-col justify-between">
              <Tooltip>
                <TooltipTrigger asChild>
                  <h3 className="font-semibold text-primary text-lg mb-1 cursor-help">
                    Recent Alerts
                  </h3>
                </TooltipTrigger>
                <TooltipContent side="top" className="bg-gradient-to-br from-slate-800 to-slate-900 text-white border border-slate-700 shadow-xl max-w-xs text-xs leading-relaxed px-3 py-2.5 rounded-lg">
                  Alerts are triggered when students show 2-3 consecutive negative check-ins or reach a sentiment threshold indicating distress.
                </TooltipContent>
              </Tooltip>
              <p className="text-[#6b7280] text-sm mb-3">Students who may need attention</p>
              <div className="space-y-3 flex-1 overflow-y-auto pr-1">
                {recentAlerts.slice(0, 5).map((alert, idx) => (
                  <div
                    key={alert.id}
                    className="flex items-center justify-between bg-[#f7fafd] rounded-xl px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      {alert.severity === "high" || alert.severity === "critical" ? (
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                      ) : alert.severity === "medium" ? (
                        <AlertCircle className="h-4 w-4 text-yellow-500" />
                      ) : (
                        <Bell className="h-4 w-4 text-blue-500" />
                      )}
                      <div>
                        <div className="font-semibold text-[#333] flex items-center gap-2">
                          {alert.name}
                          {severityBadge(alert.severity)}
                        </div>
                        <div className="text-xs text-[#6b7280]">
                          {alert.reason} • {formatDate(alert.created_at, true)}
                        </div>
                      </div>
                    </div>
                    <span className="text-[#bdbdbd] text-xl">&rarr;</span>
                  </div>
                ))}
              </div>
              <button
                className="w-full mt-4 py-2 rounded-xl border-2 border-primary text-primary font-semibold bg-gradient-to-r from-secondary to-[#f5faff] hover:scale-105 hover:shadow-lg transition-all duration-150 text-base flex items-center justify-center gap-2 cursor-pointer"
                onClick={() => setShowAllAlerts(true)}
              >
                <Info className="h-5 w-5 text-primary" />
                View All Alerts
              </button>
            </div>
          </div>
        </div>

        {showAllAlerts && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg relative">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-primary">All Alerts</h2>
                <button
                  className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-800 transition-colors"
                  onClick={() => setShowAllAlerts(false)}
                  aria-label="Close"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>
              <div
                className="max-h-[60vh] overflow-y-auto space-y-3"
                style={{ scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch' }}
              >
                {allAlerts.length === 0 ? (
                  <div className="text-gray-500 text-sm">No alerts available.</div>
                ) : (
                  allAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className="flex items-center justify-between rounded-xl px-3 py-2 bg-[#f7fafd] border border-[#e9eff6] hover:bg-white hover:shadow-sm transition"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {alert.severity === 'high' || alert.severity === 'critical' ? (
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                        ) : alert.severity === 'medium' ? (
                          <AlertCircle className="h-4 w-4 text-yellow-500" />
                        ) : (
                          <Bell className="h-4 w-4 text-blue-500" />
                        )}
                        <div className="min-w-0">
                          <div className="font-semibold text-[#333] flex items-center gap-2 truncate">
                            <span className="truncate">{alert.name}</span>
                            {severityBadge(alert.severity)}
                          </div>
                          <div className="text-xs text-[#6b7280] truncate">
                            {alert.reason} • {formatDate(alert.created_at, true)}
                          </div>
                        </div>
                      </div>
                      <span className="text-[#bdbdbd] text-xl">&rarr;</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          {/* Sentiment Breakdown (2/3 width on desktop) */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl shadow p-5 hover:shadow-md transition-all duration-300 w-full border border-gray-100">
              <div className={`${styles.cardHeader}`}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2 cursor-help">
                      <h2 className={styles.sectionTitle}>Sentiment Breakdown</h2>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="bg-gradient-to-br from-slate-800 to-slate-900 text-white border border-slate-700 shadow-xl max-w-xs text-xs leading-relaxed px-3 py-2.5 rounded-lg">
                    Distribution of sentiment from student check-ins and journals. Analyzed using NLP to classify text as Positive, Neutral, or Negative.
                  </TooltipContent>
                </Tooltip>
                <div className="flex justify-end gap-2">
                  {(["week", "month", "year"] as const).map((p) => (
                    <button
                      key={p}
                      className={`${styles.pill} ${sentimentPeriod === p ? styles.pillPrimary : styles.pillSecondary}`}
                      onClick={() => setSentimentPeriod(p)}
                    >
                      {periodLabels[p]}
                    </button>
                  ))}
                </div>
              </div>
              {/* summary tooltip now on the icon beside the title above */}
              <div className="flex items-center justify-center">
                {(() => {
                  // Normalize to fixed categories (exclude 'mixed')
                  const order = ["positive", "neutral", "negative"] as const;
                  const incoming: Record<string, number> = Object.fromEntries(
                    sentimentBreakdown.map((d: any) => [String(d.name).toLowerCase(), Number(d.value) || 0])
                  );
                  const total = order.reduce((sum, k) => sum + (incoming[k] || 0), 0);
                  const data = order.map((k) => {
                    const value = incoming[k] || 0;
                    let percent = 0;
                    if (total > 0 && Number.isFinite(value) && Number.isFinite(total)) {
                      percent = Math.round((value / total) * 100);
                    }
                    return {
                      name: k,
                      value,
                      percent,
                    };
                  });
                  if (total === 0) return <span className="text-[#6b7280] text-sm">No sentiment data available for this period.</span>;
                  // Determine dynamic chart height based on tallest bar percent to avoid clipping labels
                  const maxPercent = Math.max(...data.map(d => d.percent));
                  const chartHeight = maxPercent > 85 ? 340 : maxPercent > 65 ? 300 : 280;
                  return (
                    <ResponsiveContainer width="100%" height={chartHeight}>
                      <BarChart data={data} margin={{ top: 20, right: 8, bottom: 10, left: 8 }} barCategoryGap={6} barGap={0}>
                        <defs>
                          <linearGradient id="posGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#34d399" />
                            <stop offset="100%" stopColor="#10b981" />
                          </linearGradient>
                          <linearGradient id="negGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#fca5a5" />
                            <stop offset="100%" stopColor="#ef4444" />
                          </linearGradient>
                          <linearGradient id="neuGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#fde68a" />
                            <stop offset="100%" stopColor="#f59e0b" />
                          </linearGradient>
                          <linearGradient id="mixGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#86efac" />
                            <stop offset="100%" stopColor="#22c55e" />
                          </linearGradient>
                          <pattern id="hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                            <rect width="6" height="6" fill="#f1f5f9" />
                            <line x1="0" y1="0" x2="0" y2="6" stroke="#cbd5e1" strokeWidth="2" />
                          </pattern>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                        <XAxis
                          dataKey="name"
                          tick={{ fill: '#6b7280', fontSize: 12 }}
                          tickFormatter={(v) => ({positive: 'Positive', negative: 'Negative', neutral: 'Neutral', mixed: 'Mixed'} as Record<string,string>)[v] || v}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis hide domain={[0, (dataMax: number) => (typeof dataMax === 'number' ? dataMax : 0) * 1.15]} />
                        <RTooltip content={<CustomTooltip />} wrapperStyle={{ padding: 0, border: 'none', background: 'transparent' }} />
                        <Bar
                          dataKey="value"
                          radius={[50, 50, 50, 50]}
                          barSize={60}
                          background={{ fill: 'transparent' }}
                          isAnimationActive
                          animationDuration={800}
                          style={{ cursor: 'default' }}
                        >
                          <LabelList
                            dataKey="percent"
                            position="top"
                            fill="#6b7280"
                            offset={4}
                            formatter={(label: React.ReactNode) => `${typeof label === 'number' ? label : Number(label ?? 0)}%`}
                          />
                          {data.map((entry, index) => {
                            const key = entry.name;
                            const value = entry.value;
                            const fill = value <= 0
                              ? 'url(#hatch)'
                              : key === 'positive' ? 'url(#posGrad)'
                              : key === 'negative' ? 'url(#negGrad)'
                              : key === 'neutral'  ? 'url(#neuGrad)'
                              : 'url(#neuGrad)';
                            return <Cell key={`c-${index}`} fill={fill} />;
                          })}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  );
                })()}
              </div>
              {/* Check-in Breakdown: Mood, Energy, Stress */}
              <div className="mt-6 space-y-3">
                <div className="flex items-center justify-between mb-4">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <h3 className="text-sm font-medium text-primary cursor-help">
                        Check-in Breakdown
                      </h3>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="bg-gradient-to-br from-slate-800 to-slate-900 text-white border border-slate-700 shadow-xl max-w-xs text-xs leading-relaxed px-3 py-2.5 rounded-lg">
                      Summary of student-reported mood, energy, and stress levels from check-ins. Shows distribution across different levels for the selected period.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {(() => {
                    const metrics = [
                      {
                        title: 'Mood',
                        key: 'mood' as const,
                        color: '#10b981',
                        levels: ['Awesome', 'Great', 'Loved', 'Okay', 'Meh', 'Anxious', 'Bad', 'Terrible', 'Upset'],
                      },
                      {
                        title: 'Energy',
                        key: 'energy' as const,
                        color: '#3b82f6',
                        levels: ['Low', 'Moderate', 'High'],
                      },
                      {
                        title: 'Stress',
                        key: 'stress' as const,
                        color: '#ef4444',
                        levels: ['No Stress', 'Low Stress', 'Moderate', 'High Stress', 'Very High Stress'],
                      },
                    ];

                    // Check if there's any data to display
                    const hasData = metrics.some(metric => {
                      const data = checkinBreakdown?.[metric.key] || [];
                      return data.length > 0 && data.some((item: any) => Number(item.value) > 0);
                    });

                    if (!hasData) {
                      return (
                        <div className="col-span-3 py-8 text-center">
                          <div className="text-gray-400 mb-2">
                            <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <p className="text-gray-500 text-sm">No check-in data available. Check back later for updates.</p>
                        </div>
                      );
                    }

                    return metrics.map((metric) => {
                      const data = checkinBreakdown?.[metric.key] || [];
                      const total = data.reduce((sum: number, item: any) => sum + (Number(item.value) || 0), 0);
                      
                      if (total === 0) {
                        return (
                          <div key={metric.key} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                            <div className="flex flex-col items-center justify-center h-full">
                              <div className="text-gray-300 mb-2">
                                <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </div>
                              <h4 className="text-sm font-medium text-gray-400 mb-1">{metric.title}</h4>
                              <p className="text-xs text-gray-400">No data</p>
                            </div>
                          </div>
                        );
                      }
                      
                      // Calculate weighted average
                      let weightedSum = 0;
                      data.forEach((item: any) => {
                        const index = metric.levels.findIndex(level => level === item.label);
                        if (index >= 0) {
                          weightedSum += (index + 1) * (Number(item.value) || 0);
                        }
                      });
                      
                      const average = total > 0 ? weightedSum / total : 0;
                      const normalizedValue = (average - 1) / (metric.levels.length - 1);
                      const percentage = Math.round(normalizedValue * 100);
                      
                      // Get description based on percentage
                      let description = '';
                      if (percentage < 20) description = metric.levels[0];
                      else if (percentage < 40) description = metric.levels[1];
                      else if (percentage < 60) description = metric.levels[2];
                      else if (percentage < 80) description = metric.levels[3] || metric.levels[metric.levels.length - 1];
                      else description = metric.levels[metric.levels.length - 1];

                      return (
                        <div key={metric.key} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                          <div className="flex flex-col items-center">
                            <div className="relative w-24 h-24 mb-3">
                              <svg className="w-full h-full" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path
                                  d="M18 2.0845
                                    a 15.9155 15.9155 0 0 1 0 31.831
                                    a 15.9155 15.9155 0 0 1 0 -31.831"
                                  fill="none"
                                  stroke="#e5e7eb"
                                  strokeWidth="3"
                                  strokeDasharray="100, 100"
                                />
                                <path
                                  d="M18 2.0845
                                    a 15.9155 15.9155 0 0 1 0 31.831
                                    a 15.9155 15.9155 0 0 1 0 -31.831"
                                  fill="none"
                                  stroke={metric.color}
                                  strokeWidth="3"
                                  strokeDasharray={`${percentage}, 100`}
                                  strokeLinecap="round"
                                  className="transition-all duration-1000 ease-in-out"
                                  style={{
                                    filter: `drop-shadow(0 0 6px ${metric.color}40)`
                                  }}
                                />
                                <text
                                  x="18"
                                  y="20"
                                  textAnchor="middle"
                                  fill="#1f2937"
                                  className="text-xs font-medium"
                                >
                                  {percentage}%
                                </text>
                              </svg>
                            </div>
                            <h4 className="text-sm font-medium text-gray-700 mb-1">{metric.title}</h4>
                            <p className="text-xs text-gray-500 text-center">{description}</p>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
                
                {/* AI Summary Button Card moved below Appointment Logs */}

                {/* Wellness Summary Modal */}
                {showAISummary && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="bg-white rounded-2xl shadow-xl p-6 max-w-2xl w-full max-h-[80vh] flex flex-col">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-semibold text-primary">Weekly Wellness Summary</h3>
                      </div>
                      <div className="flex-1 overflow-y-auto mb-4">
                        {aiCheckinSummary ? (
                          <div className="prose max-w-none">
                            <p>{aiCheckinSummary}</p>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center h-32">
                            <div className="animate-pulse text-gray-500">Generating analysis...</div>
                          </div>
                        )}
                      </div>
                      <div className="flex justify-end space-x-3 pt-4 border-t">
                        <button
                          onClick={async () => {
                            try {
                              setAICheckinSummary('');
                              const [senti, mood] = await Promise.all([
                                api.get<{ summary?: string }>(`/ai/sentiment-summary`, { params: { range: 'last_week' } }),
                                api.get<{ summary?: string }>(`/ai/mood-summary`, { params: { range: 'last_week' } }),
                              ]);
                              const partA = senti.data?.summary || '';
                              const partB = mood.data?.summary || '';
                              const combined = [partA, partB].filter(Boolean).join("\n\n");
                              setAICheckinSummary(
                                combined || 'No previous week summary available from the model.'
                              );
                            } catch (error) {
                              console.error('Error generating AI summary:', error);
                            }
                          }}
                          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
                        >
                          {aiCheckinSummary ? 'Regenerate' : 'Generate'} Analysis
                        </button>
                        <button
                          onClick={() => {
                            setShowAISummary(false);
                            setAICheckinSummary('');
                          }}
                          className="px-5 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors shadow-sm"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          {/* Right rail: Appointment Logs */}
        <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl shadow p-5 hover:shadow-md transition-all duration-300 border border-gray-100 flex flex-col self-start h-[470px] justify-between">
                  <div className="flex items-center justify-between mb-4">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <h2 className="text-lg font-semibold text-primary cursor-help">
                          Appointment Logs
                        </h2>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="bg-gradient-to-br from-slate-800 to-slate-900 text-white border border-slate-700 shadow-xl max-w-xs text-xs leading-relaxed px-3 py-2.5 rounded-lg">
                        Record of students who downloaded appointment request forms. Helps track counseling demand and follow up with students seeking support.
                      </TooltipContent>
                    </Tooltip>
                    {appointmentLogs.length > APPOINTMENTS_PER_PAGE && (
                      <span className="text-xs text-gray-500">
                        {appointmentPage * APPOINTMENTS_PER_PAGE + 1}-{Math.min((appointmentPage + 1) * APPOINTMENTS_PER_PAGE, appointmentLogs.length)} of {appointmentLogs.length}
                      </span>
                    )}
                  </div>
                  <div className="space-y-3 pr-1 flex-1 overflow-y-auto">
                  {appointmentLogs.length === 0 ? (
                    <div className="text-[#6b7280] text-sm">No logs yet.</div>
                  ) : (
                    appointmentLogs
                      .slice(appointmentPage * APPOINTMENTS_PER_PAGE, (appointmentPage + 1) * APPOINTMENTS_PER_PAGE)
                      .map((log, idx) => (
                        <div
                          key={`${String(log?.log_id ?? 'log')}-${String(log?.downloaded_at ?? log?.created_at ?? idx)}-${idx}`}
                          className={`${styles.tileRow}`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-[#111827]">{log.form_type || 'Form'} downloaded</div>
                            <div className="text-xs text-[#6b7280]">
                              <span className="font-medium text-primary">{log.user_nickname || log.user_name || `User #${log.user_id}`}</span>
                              <span className="mx-1">•</span>
                              {formatDate(log.downloaded_at, true)}
                            </div>
                            {log.remarks && (
                              <div className="text-[11px] text-[#94a3b8] truncate">{log.remarks}</div>
                            )}
                          </div>
                          <span className="text-[#bdbdbd] text-xl">↓</span>
                        </div>
                      ))
                  )}
                </div>
                {/* Pagination controls */}
                {appointmentLogs.length > APPOINTMENTS_PER_PAGE && (
                  <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t">
                    <button
                      onClick={() => setAppointmentPage(p => Math.max(0, p - 1))}
                      disabled={appointmentPage === 0}
                      className="p-1 rounded-full border hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <div className="flex gap-1">
                      {Array.from({ length: Math.ceil(appointmentLogs.length / APPOINTMENTS_PER_PAGE) }).map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setAppointmentPage(i)}
                          className={`w-2 h-2 rounded-full transition-all ${appointmentPage === i ? 'bg-primary scale-125' : 'bg-gray-300 hover:bg-gray-400'}`}
                          aria-label={`Page ${i + 1}`}
                        />
                      ))}
                    </div>
                    <button
                      onClick={() => setAppointmentPage(p => Math.min(Math.ceil(appointmentLogs.length / APPOINTMENTS_PER_PAGE) - 1, p + 1))}
                      disabled={appointmentPage >= Math.ceil(appointmentLogs.length / APPOINTMENTS_PER_PAGE) - 1}
                      className="p-1 rounded-full border hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                      aria-label="Next page"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                )}
            {/* Wellness Analysis below Appointment Logs */}
            <div className="mt-5 pt-4 border-t">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="text-sm font-medium text-primary mb-2 cursor-help">
                    Weekly Wellness Summary
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="bg-gradient-to-br from-slate-800 to-slate-900 text-white border border-slate-700 shadow-xl max-w-xs text-xs leading-relaxed px-3 py-2.5 rounded-lg">
                  Generates a summary of student wellness patterns from the previous week. Uses rule-based analysis of mood trends, sentiment, and stress patterns.
                </TooltipContent>
              </Tooltip>
              <div className="flex-1 flex items-center justify-center">
                <button
                  onClick={async () => {
                    try {
                      setShowAISummary(true);
                      setAICheckinSummary('');
                      const [senti, mood] = await Promise.all([
                        api.get<{ summary?: string }>(`/ai/sentiment-summary`, { params: { range: 'last_week' } }),
                        api.get<{ summary?: string }>(`/ai/mood-summary`, { params: { range: 'last_week' } }),
                      ]);
                      const partA = senti.data?.summary || '';
                      const partB = mood.data?.summary || '';
                      const combined = [partA, partB].filter(Boolean).join("\n\n");
                      setAICheckinSummary(
                        combined || 'No previous week summary available.'
                      );
                    } catch (e) {
                      console.error('Summary generation error', e);
                      setAICheckinSummary('Failed to generate previous week summary. Please try again later.');
                    }
                  }}
                  className="w-full flex flex-col items-center justify-center gap-3 p-4 bg-white rounded-lg border-2 border-dashed border-gray-300 hover:border-indigo-400 hover:bg-indigo-50 transition-all duration-200"
                  title="Generate wellness summary for last week"
                >
                  <Lightbulb className="h-10 w-10 text-indigo-500" />
                  <span className="text-indigo-600 font-medium">Generate Last Week Summary</span>
                  <span className="text-xs text-gray-500 text-center max-w-[220px]">Analyzes mood trends and sentiment patterns from the previous week</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </TooltipProvider>
  );
}

// Use shared layout so Sidebar renders under Inertia and pages pad consistently
const Layout = (page: React.ReactNode) => <DashboardLayout>{page}</DashboardLayout>;
Object.assign(CounselorDashboard, { layout: Layout });
