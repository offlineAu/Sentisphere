import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, AlertTriangle, UserRound, CalendarDays, Activity, Download, Filter, Lightbulb } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend } from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import DashboardLayout from "../layouts/DashboardLayout";
import { LoadingSpinner } from "../components/loading-spinner";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { MoodTimeline, StressBar } from "@/components/insights";
import api from "../lib/api";
import styles from "./Reports.module.css";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import { useDashboardSocket } from "@/hooks";

type TopStat = {
  label: string;
  value: string | number;
  delta?: string;
  deltaColor?: string;
};

type RiskLevel = {
  label: string;
  className: string;
  count: number;
  change?: string;
  changeColor?: string;
};

type Alert = {
  student: string;
  risk: string;
  riskClass: string;
  time: string;
};
type ApiAlert = { severity: string; created_at: string };

type Concern = {
  label: string;
  students: number;
  percent: number;
  barColor: string;
};

type Intervention = {
  label: string;
  participants: number;
  percent: number;
  barColor: string;
};

type AttentionStudent = {
  name: string;
  risk: string;
  riskClass: string;
  score: string;
  concerns: string[];
  userId: number;
};

type TrendPoint = {
  week_start: string;
  week_end: string;
  index: number;
  avg_mood: number;
  avg_energy: number;
  avg_stress: number;
  event_name?: string | null;
  event_type?: string | null;
};

type MoodDataPoint = {
  date: string;
  avg_mood_score: number;
};

type MoodTrends = {
  daily: MoodDataPoint[];
  trend: 'improving' | 'worsening' | 'stable';
  week_avg?: number;
  prev_week_avg?: number | null;
  change_percent?: number | null;
};

type Streaks = {
  high_stress_consecutive_days: number;
  negative_mood_consecutive_days: number;
  feel_better_no_streak: number;
};

type InsightMetadata = {
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  risk_score: number;
  risk_reasoning?: string;
  week_avg?: number;
  journal_count: number;
  checkin_count: number;
  alerts_count: number;
  generated_at?: string;
};

type WeeklyInsight = {
  week_start: string;
  week_end: string;
  event_name?: string | null;
  event_type?: string | null;
  title: string;
  description: string;
  summary?: string;
  recommendation: string;
  recommendations?: string[];
  mood_trends?: MoodTrends;
  dominant_emotions?: string[];
  sentiment_breakdown?: { positive: number; neutral: number; negative: number };
  stress_energy_patterns?: { stress: Record<string, number>; energy: Record<string, number> };
  streaks?: Streaks;
  what_improved?: string[];
  what_declined?: string[];
  metadata?: InsightMetadata;
};

type CalendarEvent = { name: string; start: string; end: string; type?: string };

type TrendsResponseNew = {
  dates: string[];
  mood: number[];
  energy: number[];
  stress: number[];
  wellness_index: number[];
  current_index: number;
  previous_index: number;
  change_percent: number;
  numerical_change: number;
};

type ReportSummary = {
  week_start: string;
  week_end: string;
  current_wellness_index: number;
  previous_wellness_index: number;
  change: number;
  event_name?: string | null;
  event_type?: string | null;
  insight: string;
  insights: WeeklyInsight[];
};

type EngagementMetrics = {
  active_students_this_week: number;
  active_students_last_week: number;
  avg_checkins_per_student: number;
  participation_change: string;
};

function CustomWeekTick({ x, y, payload }: any) {
  const parts = payload.value.split("-");
  return (
    <g transform={`translate(${x},${y})`}>
      {parts.map((p: string, i: number) => (
        <text key={i} x={0} y={0} dy={20 + i * 16} textAnchor="middle" fill="var(--primary)" fontSize={12}>
          {p}
        </text>
      ))}
    </g>
  );
}

function Reports() {

  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [topStats, setTopStats] = useState<TopStat[]>([]);
  const [riskLevels, setRiskLevels] = useState<RiskLevel[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<Alert[]>([]);
  const [allAlertsList, setAllAlertsList] = useState<Alert[]>([]);
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  // New API-driven alerts state
  const [alertsApi, setAlertsApi] = useState<ApiAlert[]>([]);
  const [allAlertsApi, setAllAlertsApi] = useState<ApiAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState<boolean>(false);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [concerns, setConcerns] = useState<Concern[]>([]);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [interventionSummary, setInterventionSummary] = useState<{ total_alerts: number; resolved_alerts: number; success_rate: number } | null>(null);
  const [chatKpi, setChatKpi] = useState<{ overall_success_rate: number; total_sessions: number; successful_sessions: number; average_conversation_duration_minutes: number; average_messages_per_conversation: number } | null>(null);
  const [attentionStudents, setAttentionStudents] = useState<AttentionStudent[]>([]);
  const [trendWeeks, setTrendWeeks] = useState<TrendPoint[]>([]);
  const [participation, setParticipation] = useState(0);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [insights, setInsights] = useState<WeeklyInsight[]>([]);
  const [engagement, setEngagement] = useState<EngagementMetrics | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  const [page, setPage] = useState(0);

  // Global date filter state (Reports scope)
  const [globalRange, setGlobalRange] = useState<
    'this_week' | 'last_week' | 'last_30d' | 'this_month' | 'this_semester' | 'custom'
  >('this_week');
  const [rangeStart, setRangeStart] = useState<string>('');
  const [rangeEnd, setRangeEnd] = useState<string>('');
  const filterParams = useMemo(() => (
    globalRange === 'custom' && rangeStart && rangeEnd
      ? { range: 'custom', start: rangeStart, end: rangeEnd }
      : { range: globalRange }
  ), [globalRange, rangeStart, rangeEnd]);

  // Carousels refs
  const weeklySliderRef = useRef<any>(null);

  // Calendar events
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const calendarDays = useMemo(() => {
    const monthStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const monthEnd = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0);
    const startOffset = monthStart.getDay();
    const totalDays = monthEnd.getDate();
    const totalCells = Math.ceil((startOffset + totalDays) / 7) * 7;

    const parseDate = (val: string) => {
      const dt = new Date(val);
      return Number.isNaN(dt.getTime()) ? null : dt;
    };

    const dayCells: Array<{ date: Date; inMonth: boolean; events: CalendarEvent[] }> = [];

    for (let cell = 0; cell < totalCells; cell += 1) {
      const day = new Date(monthStart);
      day.setDate(day.getDate() + (cell - startOffset));

      const dayEvents = events.filter((ev) => {
        const start = parseDate(ev.start);
        const end = parseDate(ev.end ?? ev.start);
        if (!start || !end) return false;
        const dayDate = new Date(day.getFullYear(), day.getMonth(), day.getDate());
        const startDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        const endDate = new Date(end.getFullYear(), end.getMonth(), end.getDate());
        return dayDate >= startDate && dayDate <= endDate;
      });

      dayCells.push({
        date: day,
        inMonth: day.getMonth() === calendarMonth.getMonth(),
        events: dayEvents,
      });
    }

    return dayCells;
  }, [calendarMonth, events]);

  const uploadCalendar = async (file: File) => {
    try {
      setUploading(true);
      setUploadError(null);
      const form = new FormData();
      form.append("file", file);
      const res = await api.post(`/api/calendar/upload`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const newEvents = Array.isArray(res.data) ? res.data : [];
      setEvents(newEvents);
    } catch (e) {
      setUploadError("Failed to upload calendar. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const insightSliderSettings = useMemo(() => ({
    dots: true,
    infinite: insights.length > 1,
    arrows: false,
    autoplay: insights.length > 1,
    autoplaySpeed: 6000,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1,
    adaptiveHeight: false,
    appendDots: (dots: React.ReactNode) => (
      <div className="absolute bottom-3 left-0 right-0">
        <ul className="flex justify-center gap-2">{dots}</ul>
      </div>
    ),
    customPaging: () => <span className="block h-2 w-2 rounded-full bg-gray-300" />,
  }), [insights.length]);

  // WebSocket for instant notifications when new data arrives
  const handleDataUpdate = useCallback(() => {
    console.log('[Reports] New data notification - refreshing...');
    setRefreshKey(prev => prev + 1);
  }, []);

  useDashboardSocket({
    autoConnect: true,
    onStatsUpdate: handleDataUpdate,
  });

  // --- Fetch participation ---
  useEffect(() => {
    api.get<{ participation: number }>(`/reports/participation`, { params: filterParams })
      .then(({ data }) => setParticipation(Number(data?.participation || 0)))
      .catch(err => console.error(err));
  }, [globalRange, rangeStart, rangeEnd, refreshKey]);

  // --- Fetch reports (respects global date filter for time-dependent data) ---
  useEffect(() => {
    const fetchReports = async () => {
      try {
        const [summaryRes, trendsRes, weeklyInsightsRes, eventsRes, engagementRes] = await Promise.all([
          // Time-independent
          api.get<ReportSummary>(`/reports/summary`),
          // Time-independent: overall trends do not change with global date filter
          api.get<any>(`/reports/trends`),
          api.get<WeeklyInsight[]>(`/reports/weekly-insights`, { params: filterParams }),
          // Events listing is independent of filter
          api.get<Array<{ name: string; start: string; end: string; type?: string }>>(`/events`),
          api.get<EngagementMetrics>(`/reports/engagement`, { params: filterParams }),
        ]);
        setSummary(summaryRes.data || null);
        // Only use weekly-insights from ai_insights table (auto-generated)
        // No fallback to summary.insights to avoid showing static/fake data
        setInsights(Array.isArray(weeklyInsightsRes.data) ? weeklyInsightsRes.data : []);

        // Normalize trends data to TrendPoint[] if server returns the new arrays shape
        if (trendsRes.data && Array.isArray(trendsRes.data.dates)) {
          const d = trendsRes.data as TrendsResponseNew;
          const pts: TrendPoint[] = d.dates.map((dt, i) => ({
            week_start: dt,
            week_end: dt,
            index: d.wellness_index[i] ?? 0,
            avg_mood: d.mood[i] ?? 0,
            avg_energy: d.energy[i] ?? 0,
            avg_stress: d.stress[i] ?? 0,
          }));
          setTrendWeeks(pts);
        } else {
          setTrendWeeks(trendsRes.data?.weeks || []);
        }

        setEvents(Array.isArray(eventsRes.data) ? eventsRes.data : []);
        setEngagement(engagementRes.data || null);

        const topRes = await api.get<any>(`/reports/top-stats`, { params: filterParams });
        const topData = topRes.data || {};

        const calcDelta = (current?: number, previous?: number) => {
          // Handle undefined/null values
          if (current === undefined || current === null) {
            return { delta: "", deltaColor: "" };
          }
          if (previous === undefined || previous === null) {
            return { delta: "", deltaColor: "" };
          }
          
          // Convert to numbers and validate
          const c = Number(current);
          const p = Number(previous);
          
          // Check for invalid numbers
          if (!Number.isFinite(c) || !Number.isFinite(p)) {
            return { delta: "", deltaColor: "" };
          }
          
          // If previous is 0, show "new" or absolute change
          if (p === 0) {
            if (c === 0) {
              return { delta: "", deltaColor: "" };
            }
            return { delta: "New", deltaColor: "text-blue-600" };
          }
          
          // Calculate percentage change
          const change = ((c - p) / Math.abs(p)) * 100;
          
          // Handle very small changes (less than 0.1%)
          if (Math.abs(change) < 0.1) {
            return { delta: "~0%", deltaColor: "text-gray-600" };
          }
          
          const sign = change >= 0 ? "+" : "";
          const color = change >= 0 ? "text-green-600" : "text-red-600";
          return { delta: `${sign}${change.toFixed(1)}%`, deltaColor: color };
        };

        setTopStats([
          {
            label: "Total Students",
            value: topData.total_students,
            ...calcDelta(topData.total_students, topData.total_students_previous),
          },
          {
            label: "Active Users",
            value: topData.active_users,
            ...calcDelta(topData.active_users, topData.active_users_previous),
          },
          {
            label: "At-Risk Students",
            value: topData.at_risk_students,
            ...calcDelta(topData.at_risk_students, topData.at_risk_students_previous),
          },
          {
            label: "Avg. Wellness Score",
            value: topData.avg_wellness_score,
            ...calcDelta(topData.avg_wellness_score, topData.avg_wellness_score_previous),
          },
        ]);

        // Fetch alerts from unified endpoint for Risk Assessment card
        setAlertsLoading(true);
        setAlertsError(null);
        try {
          const res = await api.get<ApiAlert[]>(`/alerts`, { params: filterParams });
          const data = Array.isArray(res.data) ? res.data : [];
          // Sort newest first
          data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          setAlertsApi(data);
          // Fetch all alerts for totals (counts include all-time, not just recent)
          const allRes = await api.get<any[]>(`/all-alerts`, { params: filterParams });
          const allDataRaw = Array.isArray(allRes.data) ? allRes.data : [];
          const allData: ApiAlert[] = allDataRaw.map((r: any) => ({ severity: r.severity, created_at: r.created_at }));
          setAllAlertsApi(allData);
        } catch (e) {
          setAlertsError("Failed to load alerts. Please try again later.");
          setAlertsApi([]);
          setAllAlertsApi([]);
        } finally {
          setAlertsLoading(false);
        }

        // Use AI-powered top concerns endpoint that analyzes journal content and check-in comments
        const concernsRes = await api.get<any[]>(`/reports/top-concerns`, { params: { ...filterParams } });
        const concernsData = Array.isArray(concernsRes.data) ? concernsRes.data : [];
        setConcerns(concernsData.map((c: any) => ({ 
          ...c, 
          barColor: c.barColor || "#2563eb" 
        })));

        const interventionsRes = await api.get<any>(`/reports/interventions`, { params: { ...filterParams } });
        const interventionsData = interventionsRes.data || {};
        setInterventionSummary(interventionsData.summary || null);
        const byType = Array.isArray(interventionsData.by_type) ? interventionsData.by_type : [];
        setInterventions(byType.map((i: any) => ({ ...i, barColor: "var(--primary)" })));

        // Chat-based KPI
        const kpiRes = await api.get<any>(`/analytics/intervention-success`, { params: filterParams });
        setChatKpi(kpiRes.data || null);

        const attentionRes = await api.get<any[]>(`/reports/attention`, { params: filterParams });
        const attentionData = attentionRes.data || [];
        setAttentionStudents(
          attentionData.map((s: any) => ({
            ...s,
            userId: s.user_id,
            riskClass: s.risk === "High" ? styles.riskHigh : s.risk === "Medium" ? styles.riskMedium : styles.riskLow,
          }))
        );

        setLoading(false);
      } catch (err) {
        console.error("Error fetching reports:", err);
        setLoading(false);
      }
    };

    fetchReports();
  }, [globalRange, rangeStart, rangeEnd, refreshKey]);

  if (loading) return (
    <div className="flex h-[80vh] w-full items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <LoadingSpinner size="lg" className="text-primary" />
        <p className="text-muted-foreground">Loading reports...</p>
      </div>
    </div>
  );

  const itemsPerPage = 4;
  // Sort by week_end (rolling current date) so labels progress like
  // Mon–Mon, Mon–Tue, ..., Mon–Sun, then next week starts.
  const sortedTrendWeeks = [...trendWeeks].sort((a, b) => new Date(b.week_end).getTime() - new Date(a.week_end).getTime());
  const maxPage = Math.max(0, Math.ceil(sortedTrendWeeks.length / itemsPerPage) - 1);
  const startIndex = page * itemsPerPage;
  const paginatedTrendData = sortedTrendWeeks.slice(startIndex, startIndex + itemsPerPage).map((wk) => ({
    week_label: `${new Date(wk.week_start).toLocaleDateString(undefined, { month: "short", day: "2-digit" })} - ${new Date(wk.week_end).toLocaleDateString(undefined, { month: "short", day: "2-digit" })}`,
    wellness: wk.index,
    mood: wk.avg_mood,
    energy: wk.avg_energy,
    stress: wk.avg_stress,
  }));

  const latestIndex = sortedTrendWeeks[0]?.index ?? 0;
  const prevIndex = sortedTrendWeeks[1]?.index ?? 0;
  
  // Robust percentage calculation
  const calculateChangePct = (current: number, previous: number): number => {
    if (!Number.isFinite(current) || !Number.isFinite(previous)) return 0;
    if (previous === 0) return current === 0 ? 0 : 100;
    return Math.round(((current - previous) / Math.abs(previous)) * 100);
  };
  
  const changePct = calculateChangePct(latestIndex, prevIndex);

  return (
    <main
      className={`transition-all duration-200 min-h-screen pt-1 pr-6 pb-6 w-full p-4 sm:p-5 space-y-5 max-w-full`}
      style={{ minHeight: "100vh", backgroundColor: "transparent" }}
    >
      {/* Header */}
      <div className="ml-2">
        <h1 className={styles.headerTitle}>Reports & Analytics</h1>
        <p className={styles.headerSubtitle}>
          Comprehensive insights into student wellness and platform usage
        </p>
        <div />
      </div>

      {/* Global Date Filter */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-primary" />
          <select
            className="border rounded-lg px-2 py-1 text-sm"
            value={globalRange}
            onChange={(e) => setGlobalRange(e.target.value as any)}
          >
            <option value="this_week">This Week</option>
            <option value="last_week">Last Week</option>
            <option value="this_month">This Month</option>
            <option value="custom">Custom Range</option>
          </select>
          {globalRange === 'custom' && (
            <>
              <input
                type="date"
                className="border rounded-lg px-2 py-1 text-sm"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
              />
              <span className="text-gray-400">—</span>
              <input
                type="date"
                className="border rounded-lg px-2 py-1 text-sm"
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
              />
            </>
          )}
        </div>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {topStats.length === 0 ? (
          <div className="col-span-1 sm:col-span-2 lg:col-span-4">
            <div className="bg-white rounded-2xl shadow p-6 text-center text-sm text-gray-500">No statistics available for this period.</div>
          </div>
        ) : topStats.map((stat, i) => {
          const isTotal = stat.label === "Total Students";
          const isRisk = stat.label === "At-Risk Students";
          const isActive = stat.label === "Active Users";
          const isWellness = stat.label === "Avg. Wellness Score";
          const baseCard = "rounded-2xl shadow p-4 cursor-help";
          const gradientGreen = "bg-gradient-to-br from-primary/85 to-primary text-white";
          const gradientRed = "bg-gradient-to-br from-[#f87171] to-[#dc2626] text-white";
          const gradientBlue = "bg-gradient-to-br from-[#38bdf8] to-[#0ea5e9] text-white";
          const gradientYellow = "bg-gradient-to-br from-[#facc15] to-[#eab308] text-white";
          const whiteCard = "bg-white hover:shadow-md transition";
          const cardClass = `${baseCard} ${
            isTotal
              ? gradientGreen
              : isRisk
              ? gradientRed
              : isActive
              ? gradientBlue
              : isWellness
              ? gradientYellow
              : whiteCard
          }`;
          const isGradient = isTotal || isRisk || isActive || isWellness;
          const titleClass = isGradient ? "text-sm font-medium opacity-90" : "text-sm font-medium text-gray-600";
          const valueClass = isGradient ? "text-3xl font-extrabold mt-1" : "text-xl font-bold text-gray-900";
          const deltaClass = isGradient ? "text-xs opacity-90 mt-1 flex items-center gap-1" : `text-xs ${stat.deltaColor}`;

          // Tooltips for each stat
          const tooltips: Record<string, string> = {
            "Total Students": "Total number of registered students in the system.",
            "Active Users": "Students who submitted at least one check-in this week. Excludes counselors.",
            "At-Risk Students": "Students with open high-severity alerts requiring attention.",
            "Avg. Wellness Score": "Average wellness index (0-100) based on mood, energy, and stress levels this week.",
          };

          return (
            <div key={i} className={cardClass} title={tooltips[stat.label] || stat.label}>
              <div className="flex items-center justify-between">
                <h3 className={titleClass}>{stat.label}</h3>
                {stat.delta && (isTotal || isRisk) ? (
                  <ChevronRight className="h-3 w-3" />
                ) : stat.delta ? (
                  <TrendingUp className={`h-3 w-3 ${stat.deltaColor}`} />
                ) : null}
              </div>
              <div className={valueClass}>{stat.value}</div>
              {stat.delta && (
                <div className={deltaClass}>
                  {(isTotal || isRisk) && <ChevronRight className="h-3 w-3" />} {stat.delta}
                  <span className="ml-1 opacity-70 text-[10px]">vs last week</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Trends + Academic Calendar (Trends emphasized) */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl shadow p-4 w-full max-w-full xl:col-span-2">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2">
              <h2 className={styles.sectionTitle}>Wellness Trends</h2>
              <span className="text-[10px] text-blue-500 cursor-help" title="Weekly wellness metrics: Wellness Index (overall score 0-100), Mood (happiness level), Energy (activity level), and Stress (pressure level). Higher is better for all except Stress.">ⓘ</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                className={`p-2 rounded-full border ${page === 0 ? "opacity-40 cursor-not-allowed" : "hover:bg-gray-100"}`}
                onClick={() => setPage(p => Math.max(p - 1, 0))}
                disabled={page === 0}
                title="View earlier weeks"
              >
                <ChevronLeft className="h-5 w-5 text-primary" />
              </button>
              <button
                className={`p-2 rounded-full border ${page === maxPage ? "opacity-40 cursor-not-allowed" : "hover:bg-gray-100"}`}
                onClick={() => setPage(p => Math.min(p + 1, maxPage))}
                disabled={page === maxPage}
                title="View later weeks"
              >
                <ChevronRight className="h-5 w-5 text-primary" />
              </button>
            </div>
          </div>

          <div className="h-[350px] flex items-center justify-center -ml-1">
            {paginatedTrendData.length === 0 ? (
              <span className="text-gray-500 text-sm">No wellness data available.</span>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={paginatedTrendData} margin={{ top: 20, right: 60, bottom: 64, left: 0 }}>
                  <defs>
                    <linearGradient id="lineWellness" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.85} />
                      <stop offset="100%" stopColor="#86efac" stopOpacity={0.25} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="week_label" interval={0} stroke="var(--primary)" angle={0} height={64} tick={{ fill: "var(--foreground)", fontSize: 12 }} />
                  <YAxis domain={[0, 100]} tick={{ fill: "var(--foreground)", fontSize: 12 }} stroke="var(--primary)" />
                  <RTooltip 
                    contentStyle={{
                      backgroundColor: 'white',
                      border: 'none',
                      borderRadius: '12px',
                      boxShadow: '0 10px 40px -5px rgba(0, 0, 0, 0.15)',
                      padding: '12px 16px',
                    }}
                    labelStyle={{ fontWeight: 600, marginBottom: '8px', color: '#111827' }}
                    itemStyle={{ padding: '2px 0', fontSize: '13px' }}
                    formatter={(value: number, name: string) => {
                      const labels: Record<string, string> = {
                        'Wellness Index': 'Overall wellness score',
                        'Mood': 'Average mood level',
                        'Energy': 'Average energy level',
                        'Stress': 'Average stress level (lower is better)',
                      };
                      return [`${value}%`, <span title={labels[name] || name}>{name}</span>];
                    }}
                    labelFormatter={(label) => `Week of ${label}`}
                  />
                  <Legend verticalAlign="top" height={32} wrapperStyle={{ fontSize: "0.75rem" }} />
                  <Line type="monotone" dataKey="wellness" name="Wellness Index" stroke="var(--primary)" strokeWidth={3} dot={{ r: 5, strokeWidth: 2, fill: 'white' }} activeDot={{ r: 8, fill: 'var(--primary)', stroke: 'white', strokeWidth: 2 }} />
                  <Line type="monotone" dataKey="mood" name="Mood" stroke="#22c55e" strokeWidth={2} dot={{ r: 4, fill: 'white' }} activeDot={{ r: 7, fill: '#22c55e', stroke: 'white', strokeWidth: 2 }} />
                  <Line type="monotone" dataKey="energy" name="Energy" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4, fill: 'white' }} activeDot={{ r: 7, fill: '#3b82f6', stroke: 'white', strokeWidth: 2 }} />
                  <Line type="monotone" dataKey="stress" name="Stress" stroke="#ef4444" strokeWidth={2} dot={{ r: 4, fill: 'white' }} activeDot={{ r: 7, fill: '#ef4444', stroke: 'white', strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Stats Row */}
          <div className="flex flex-col sm:flex-row justify-between mt-4 gap-2">
            {(() => {
              const chText = `${changePct >= 0 ? "+" : ""}${changePct}%`;
              const items = [
                { label: "Current Index", value: `${Math.round(latestIndex)}%`, tooltip: "This week's overall wellness score (0-100%). Combines mood, energy, and stress metrics." },
                { label: "Change vs Last Week", value: chText, className: changePct >= 0 ? "text-green-600" : "text-red-600", tooltip: "Percentage change in wellness index compared to the previous week." },
                { label: "Active Event", value: summary?.event_name ? `${summary.event_name}` : "None", tooltip: "Current academic event that may affect student wellness (exams, holidays, etc.)." },
              ];
              return items.map((s, i) => (
                <div key={i} className="flex-1 bg-gray-50 rounded-xl p-3 text-center cursor-help" title={s.tooltip}>
                  <div className="text-[#6b7280] text-xs font-medium">{s.label}</div>
                  <div className={`text-lg font-bold ${s.className || "text-[#333]"}`}>{s.value}</div>
                </div>
              ));
            })()}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border p-4 xl:col-span-1 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className={styles.sectionTitle}>Academic Calendar</h2>
                <span className="text-[10px] text-blue-500 cursor-help" title="Upload .ics or .csv calendar files to track academic events. Events are correlated with wellness trends to identify stress patterns during exams or holidays.">ⓘ</span>
              </div>
              <p className="text-xs text-[#6b7280] mt-1">Track events that may impact student wellness.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="p-2 rounded-full border hover:bg-gray-100"
                onClick={() => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold text-[#111827] w-28 text-center">
                {calendarMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
              </span>
              <button
                className="p-2 rounded-full border hover:bg-gray-100"
                onClick={() => setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-[11px] font-semibold text-[#6b7280]">
            {"Sun Mon Tue Wed Thu Fri Sat".split(" ").map((day) => (
              <div key={day} className="text-center py-1 uppercase tracking-wide">{day}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 mt-1 flex-1">
            {calendarDays.map(({ date, inMonth, events: dayEvents }, idx) => {
              const isToday = (() => {
                const now = new Date();
                return date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
              })();
              return (
                <div
                  key={`${date.toISOString()}-${idx}`}
                  className={`rounded-xl border p-2 min-h-[56px] flex flex-col gap-1 text-[10px] ${inMonth ? "bg-gray-50" : "bg-gray-100/60 text-gray-400"} ${isToday ? "border-primary" : "border-gray-200"}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`font-semibold text-base ${inMonth ? "text-[#111827]" : "text-gray-400"}`}>{date.getDate()}</span>
                    {dayEvents.length > 0 && <span className="text-[10px] text-primary font-semibold">{dayEvents.length}</span>}
                  </div>
                  {dayEvents.slice(0, 2).map((ev, i) => (
                    <div key={i} className="rounded-md bg-primary/10 px-1 py-0.5 text-[10px] text-primary truncate">
                      {ev.name}
                    </div>
                  ))}
                  {dayEvents.length > 2 && (
                    <div className="text-[9px] text-[#6b7280]">+{dayEvents.length - 2} more</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Weekly Insights (full width) */}
      <div className="grid grid-cols-1 gap-4">
        <div className="bg-white rounded-2xl shadow p-4 relative">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className={styles.sectionTitle}>Weekly Insights</h2>
              <p className="text-xs text-[#6b7280] mt-1">
                NLP-generated wellness analysis from student check-ins and journals.
                <span className="ml-1 text-[10px] text-blue-500" title="Insights are auto-generated every Monday based on the previous week's data. Only weeks with sufficient data are shown.">ⓘ</span>
              </p>
            </div>
            {insights.length > 0 && (
              <div className="flex items-center gap-2">
                <button className="p-1 rounded-full border hover:bg-gray-100" onClick={() => weeklySliderRef.current?.slickPrev()} aria-label="Previous insight">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button className="p-1 rounded-full border hover:bg-gray-100" onClick={() => weeklySliderRef.current?.slickNext()} aria-label="Next insight">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
          {insights.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                <Lightbulb className="h-6 w-6 text-gray-400" />
              </div>
              <p className="text-sm text-gray-500 font-medium">No weekly insights yet</p>
              <p className="text-xs text-gray-400 mt-1 max-w-[280px]">
                Insights are automatically generated every Monday when there's enough student data from the previous week.
              </p>
            </div>
          ) : (
            <div className="relative pb-10">
              <Slider ref={weeklySliderRef} {...insightSliderSettings} className="weekly-insights-slider">
                {insights.map((insight, idx) => (
                  <div key={`${insight.week_start}-${idx}`} className="px-1 h-full">
                    <div className="rounded-2xl shadow-sm border bg-gray-50 p-4 text-sm flex h-full flex-col space-y-3 transition hover:shadow-md">
                      {/* Header with date range and risk badge */}
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-[#6b7280]">
                          <span>{new Date(insight.week_start).toLocaleDateString()} - {new Date(insight.week_end).toLocaleDateString()}</span>
                          {insight.event_name && (
                            <span className="ml-2 px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-[10px] font-medium">
                              {insight.event_name}
                            </span>
                          )}
                        </div>
                        {insight.metadata?.risk_level && (
                          <RiskBadge
                            level={insight.metadata.risk_level}
                            score={insight.metadata.risk_score}
                            reasoning={insight.metadata.risk_reasoning}
                            size="sm"
                          />
                        )}
                      </div>

                      {/* Title and summary */}
                      <div>
                        <h3 className="text-base font-semibold text-[#111827]">{insight.title}</h3>
                        <p className="text-[#374151] mt-1 leading-relaxed">{insight.summary || insight.description}</p>
                      </div>

                      {/* Mood Timeline */}
                      {insight.mood_trends && insight.mood_trends.daily && insight.mood_trends.daily.length > 0 && (
                        <div className="bg-white rounded-lg p-3 border">
                          <MoodTimeline moodTrends={insight.mood_trends} height={80} showTrendBadge={true} />
                        </div>
                      )}

                      {/* What Changed section */}
                      {(insight.what_improved?.length || insight.what_declined?.length) && (
                        <div className="grid grid-cols-2 gap-2">
                          {insight.what_improved && insight.what_improved.length > 0 && (
                            <div className="bg-green-50 rounded-lg p-2">
                              <div className="flex items-center gap-1 text-green-700 text-[10px] font-semibold">
                                <TrendingUp className="h-3 w-3" /> Improved
                              </div>
                              <div className="text-xs text-green-800 mt-1">
                                {insight.what_improved.map(item => item.replace(/_/g, ' ')).join(', ')}
                              </div>
                            </div>
                          )}
                          {insight.what_declined && insight.what_declined.length > 0 && (
                            <div className="bg-red-50 rounded-lg p-2">
                              <div className="flex items-center gap-1 text-red-700 text-[10px] font-semibold">
                                <TrendingDown className="h-3 w-3" /> Declined
                              </div>
                              <div className="text-xs text-red-800 mt-1">
                                {insight.what_declined.map(item => item.replace(/_/g, ' ')).join(', ')}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Recommendation */}
                      <div className="bg-white rounded-lg p-3 border border-dashed border-primary/40">
                        <div className="flex items-center gap-1 text-xs uppercase tracking-wide text-primary font-semibold mb-1">
                          <Lightbulb className="h-3 w-3" /> Recommendation
                        </div>
                        <p className="text-sm text-[#0f172a] leading-relaxed">
                          {insight.recommendations?.[0] || insight.recommendation}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </Slider>
            </div>
          )}
        </div>
      </div>

      {/* Engagement Metrics (full width under paired sections) */}
      <div className="bg-white rounded-2xl shadow p-4 min-h-[200px] flex flex-col">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-[#333] font-semibold text-sm">Engagement Metrics</h3>
          <span className="text-[10px] text-blue-500 cursor-help" title="Tracks student participation and activity levels. Higher engagement often correlates with better wellness outcomes.">ⓘ</span>
        </div>
        {!engagement ? (
          <div className="flex flex-col items-center justify-center py-6 text-center flex-1">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-2">
              <Activity className="h-5 w-5 text-gray-400" />
            </div>
            <p className="text-sm text-gray-500">No engagement data yet</p>
            <p className="text-xs text-gray-400 mt-1">Data will appear once students start using the app.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center flex-1">
            <div className="bg-gray-50 rounded-xl p-3 flex flex-col justify-center cursor-help" title="Number of unique students who submitted at least one check-in this week.">
              <div className="text-[#6b7280] text-xs">Active Students (This Week)</div>
              <div className="text-xl font-bold text-[#111827]">{engagement.active_students_this_week}</div>
              <div className="text-xs text-[#6b7280]">Last Week: {engagement.active_students_last_week}</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 flex flex-col justify-center cursor-help" title="Average number of emotional check-ins submitted per active student this week.">
              <div className="text-[#6b7280] text-xs">Avg Check-ins / Student</div>
              <div className="text-xl font-bold text-[#111827]">{engagement.avg_checkins_per_student}</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 flex flex-col justify-center cursor-help" title="Percentage change in student participation compared to last week. Positive = more students engaging.">
              <div className="text-[#6b7280] text-xs">Participation Change</div>
              <div className={`text-xl font-bold ${String(engagement.participation_change).startsWith('-') ? 'text-red-600' : 'text-green-600'}`}>{engagement.participation_change}</div>
            </div>
          </div>
        )}
      </div>
      {/* Concerns & Interventions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl shadow p-4">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-[#333] font-semibold text-sm">Top Student Concerns</h3>
            <span className="text-[10px] text-blue-500 cursor-help" title="AI-analyzed themes from student journals and check-in comments. Each concern shows unique student count (same student counted once per concern).">ⓘ</span>
          </div>
          <div className="space-y-2">
            {concerns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <p className="text-sm text-gray-500">{globalRange === 'this_week' ? 'No concerns detected this week' : 'No data for this period'}</p>
                <p className="text-xs text-gray-400 mt-1">Concerns are extracted from journal entries and check-in comments.</p>
              </div>
            ) : (
              concerns.map((c, i) => (
                <div key={i} className="cursor-help" title={`${c.students} unique students expressed concerns related to "${c.label}"`}>
                  <div className="flex justify-between text-xs flex-wrap gap-1">
                    <span className="font-medium">{c.label}</span>
                    <span className="text-gray-500">{c.students} students ({c.percent}%)</span>
                  </div>
                  <div className="h-2 bg-[#e5e5e5] rounded mt-1">
                    <div className="h-2 rounded transition-all" style={{ width: `${c.percent}%`, background: c.barColor }}></div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow p-4">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-[#333] font-semibold text-sm">Intervention Success</h3>
            <span className="text-[10px] text-blue-500 cursor-help" title="Measures counselor intervention effectiveness. Success rate combines alert resolution (60%) and conversation completion (40%).">ⓘ</span>
          </div>
          {chatKpi ? (
            <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
              <div className="bg-gray-50 rounded-xl p-3 text-center cursor-help" title="Overall success rate: weighted average of alert resolution (60%) and conversation completion (40%).">
                <div className="text-[#6b7280]">Overall Success</div>
                <div className="text-lg font-bold text-green-600">{chatKpi.overall_success_rate}%</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center cursor-help" title="Total chat conversations between students and counselors.">
                <div className="text-[#6b7280]">Total Sessions</div>
                <div className="text-lg font-bold text-[#111827]">{chatKpi.total_sessions}</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center cursor-help" title="Percentage of alerts that have been resolved by counselors.">
                <div className="text-[#6b7280]">Alerts Resolved</div>
                <div className="text-lg font-bold text-[#111827]">{(chatKpi as any).resolved_alerts || 0}/{(chatKpi as any).total_alerts || 0}</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center cursor-help" title="Average number of messages exchanged per conversation.">
                <div className="text-[#6b7280]">Avg. Messages</div>
                <div className="text-lg font-bold text-[#111827]">{chatKpi.average_messages_per_conversation}</div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-4 text-center mb-3">
              <p className="text-sm text-gray-500">No intervention data yet</p>
              <p className="text-xs text-gray-400 mt-1">Metrics will appear after counselor-student interactions.</p>
            </div>
          )}
          {interventions.length > 0 && (
            <div className="space-y-2 border-t pt-3">
              <div className="text-xs text-gray-500 font-medium mb-2">By Intervention Type</div>
              {interventions.map((i, idx) => (
                <div key={idx}>
                  <div className="flex justify-between text-xs flex-wrap gap-1">
                    <span className="font-medium">{i.label}</span>
                    <span className="text-gray-500">{i.participants} ({i.percent}%)</span>
                  </div>
                  <div className="h-2 bg-[#e5e5e5] rounded mt-1">
                    <div className="h-2 rounded transition-all" style={{ width: `${i.percent}%`, background: i.barColor }}></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Students Requiring Attention Table */}
      <div className="bg-white rounded-2xl shadow p-4 overflow-x-auto">
        <div className="flex items-center gap-2 mb-3">
          <h3 className={styles.tableTitle}>
            <span className="mr-2">Students Requiring Attention</span>
            <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-medium">{attentionStudents.length}</span>
          </h3>
          <span className="text-[10px] text-blue-500 cursor-help" title="Students with open high-severity alerts. Click the envelope icon to send a wellness check notification to their mobile app.">ⓘ</span>
        </div>
        {attentionStudents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-3">
              <UserRound className="h-6 w-6 text-green-600" />
            </div>
            <p className="text-sm text-gray-600 font-medium">All students are doing well!</p>
            <p className="text-xs text-gray-400 mt-1">No high-risk alerts requiring immediate attention.</p>
          </div>
        ) : (
          <table className="w-full text-xs min-w-[600px]">
            <thead>
              <tr className="text-[#6b7280] border-b">
                <th className="py-2 text-left" title="Student's display name">Student</th>
                <th className="py-2 text-left" title="Current risk assessment level">Risk Level</th>
                <th className="py-2 text-left" title="Calculated risk score (0-100)">Score</th>
                <th className="py-2 text-left" title="Main issues identified from check-ins and journals">Primary Concerns</th>
                <th className="py-2 text-left" title="Available actions for this student">Actions</th>
              </tr>
            </thead>
            <tbody>
              {attentionStudents.map((student, i) => (
                <tr key={i} className="border-b hover:bg-gray-50 transition-colors">
                  <td className="py-2 font-medium text-[#333]">{student.name}</td>
                  <td>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${student.riskClass}`}>{student.risk}</span>
                  </td>
                  <td className="font-bold text-[#333]">{student.score}</td>
                  <td>
                    {student.concerns.map((c, idx) => (
                      <span key={idx} className={styles.concernTag}>{c}</span>
                    ))}
                  </td>
                  <td className="flex gap-2">
                    <span
                      role="button"
                      title="Send wellness check notification to student's mobile app"
                      className="cursor-pointer text-lg hover:scale-110 transition-transform"
                      onClick={async () => {
                        try {
                          const message = `Hi ${student.name}, we noticed a few signs that you might benefit from a quick chat. When you're ready, please consider speaking with a counselor — we're here to help.`;
                          await api.post(`/notify-student`, {
                            user_id: student.userId,
                            message,
                          });
                          window.alert("Notification sent to the student's mobile app.");
                        } catch (e) {
                          window.alert("Failed to send notification. Please try again.");
                        }
                      }}
                    >
                      ✉️
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}

// Use shared layout so Sidebar renders and paddings are consistent across pages
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(Reports as any).layout = (page: React.ReactNode) => <DashboardLayout>{page}</DashboardLayout>;

export default Reports;
