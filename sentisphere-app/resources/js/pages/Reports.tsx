import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, TrendingUp, AlertTriangle, UserRound, CalendarDays, Activity, Download, Filter } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend } from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import DashboardLayout from "../layouts/DashboardLayout";
import { LoadingSpinner } from "../components/loading-spinner";
import api from "../lib/api";
import styles from "./Reports.module.css";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";

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

type WeeklyInsight = {
  week_start: string;
  week_end: string;
  event_name?: string | null;
  event_type?: string | null;
  title: string;
  description: string;
  recommendation: string;
};

type BehaviorInsight = {
  title: string;
  description: string;
  metrics?: Array<{ label: string; value: number | string }>;
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
  const behaviorSliderRef = useRef<any>(null);

  // Behavior insights and events
  const [behaviorInsights, setBehaviorInsights] = useState<BehaviorInsight[]>([]);
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

  // --- Fetch participation ---
  useEffect(() => {
    api.get<{ participation: number }>(`/reports/participation`, { params: filterParams })
      .then(({ data }) => setParticipation(Number(data?.participation || 0)))
      .catch(err => console.error(err));
  }, [globalRange, rangeStart, rangeEnd]);

  // --- Fetch reports (respects global date filter for time-dependent data) ---
  useEffect(() => {
    const fetchReports = async () => {
      try {
        const [summaryRes, trendsRes, weeklyInsightsRes, behaviorRes, eventsRes, engagementRes] = await Promise.all([
          // Time-independent
          api.get<ReportSummary>(`/reports/summary`),
          // Time-independent: overall trends do not change with global date filter
          api.get<any>(`/reports/trends`),
          api.get<WeeklyInsight[]>(`/reports/weekly-insights`, { params: filterParams }),
          api.get<BehaviorInsight[]>(`/reports/behavior-insights`, { params: filterParams }),
          // Events listing is independent of filter
          api.get<Array<{ name: string; start: string; end: string; type?: string }>>(`/events`),
          api.get<EngagementMetrics>(`/reports/engagement`, { params: filterParams }),
        ]);
        setSummary(summaryRes.data || null);
        // Prefer dedicated weekly-insights endpoint if available
        if (Array.isArray(weeklyInsightsRes.data) && weeklyInsightsRes.data.length) {
          setInsights(weeklyInsightsRes.data);
        } else {
          setInsights(summaryRes.data?.insights || []);
        }

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

        setBehaviorInsights(Array.isArray(behaviorRes.data) ? behaviorRes.data : []);
        setEvents(Array.isArray(eventsRes.data) ? eventsRes.data : []);
        setEngagement(engagementRes.data || null);

        const topRes = await api.get<any>(`/reports/top-stats`, { params: filterParams });
        const topData = topRes.data || {};

        const calcDelta = (current?: number, previous?: number) => {
          if (previous === undefined || previous === null || previous === 0) {
            return { delta: "", deltaColor: "" };
          }
          const c = Number(current ?? 0);
          const p = Number(previous ?? 0);
          if (!Number.isFinite(c) || !Number.isFinite(p) || p === 0) {
            return { delta: "", deltaColor: "" };
          }
          const change = ((c - p) / p) * 100;
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

        const concernsRes = await api.get<any[]>(`/reports/concerns`, { params: filterParams });
        const concernsData = concernsRes.data || [];
        setConcerns(concernsData.map((c: any) => ({ ...c, barColor: "#2563eb" })));

        const interventionsRes = await api.get<any>(`/reports/interventions`, { params: filterParams });
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
  }, [globalRange, rangeStart, rangeEnd]);

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
  const prevIndex = sortedTrendWeeks[1]?.index ?? latestIndex;
  const changePct = prevIndex !== 0 ? Math.round(((latestIndex - prevIndex) / Math.max(prevIndex, 1e-9)) * 100) : 0;

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
            <option value="last_30d">Last 30 Days</option>
            <option value="this_month">This Month</option>
            <option value="this_semester">This Semester</option>
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
          const baseCard = "rounded-2xl shadow p-4";
          const gradientGreen = "bg-gradient-to-br from-primary/85 to-primary text-white";
          const gradientRed = "bg-gradient-to-br from-[#f87171] to-[#dc2626] text-white";
          const gradientBlue = "bg-gradient-to-br from-[#38bdf8] to-[#0ea5e9] text-white"; // Active Users
          const gradientYellow = "bg-gradient-to-br from-[#facc15] to-[#eab308] text-white"; // Avg. Wellness Score
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

          return (
            <div key={i} className={cardClass}>
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
            <h2 className={styles.sectionTitle}>Trends</h2>
            <div className="flex items-center gap-2">
              <button
                className={`p-2 rounded-full border ${page === 0 ? "opacity-40 cursor-not-allowed" : "hover:bg-gray-100"}`}
                onClick={() => setPage(p => Math.max(p - 1, 0))}
                disabled={page === 0}
              >
                <ChevronLeft className="h-5 w-5 text-primary" />
              </button>
              <button
                className={`p-2 rounded-full border ${page === maxPage ? "opacity-40 cursor-not-allowed" : "hover:bg-gray-100"}`}
                onClick={() => setPage(p => Math.min(p + 1, maxPage))}
                disabled={page === maxPage}
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
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="week_label" interval={0} stroke="var(--primary)" angle={0} height={64} tick={{ fill: "var(--foreground)", fontSize: 12 }} />
                  <YAxis domain={[0, 100]} tick={{ fill: "var(--foreground)", fontSize: 12 }} stroke="var(--primary)" />
                  <RTooltip formatter={(value: number) => `${value}%`} labelFormatter={(label) => `Week ${label}`} />
                  <Legend verticalAlign="top" height={32} wrapperStyle={{ fontSize: "0.75rem" }} />
                  <Line type="monotone" dataKey="wellness" name="Wellness Index" stroke="var(--primary)" strokeWidth={3} dot={{ r: 5, strokeWidth: 2 }} activeDot={{ r: 7 }} />
                  <Line type="monotone" dataKey="mood" name="Mood" stroke="#22c55e" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="energy" name="Energy" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="stress" name="Stress" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Stats Row */}
          <div className="flex flex-col sm:flex-row justify-between mt-4 gap-2">
            {(() => {
              const chText = `${changePct >= 0 ? "+" : ""}${changePct}%`;
              const items = [
                { label: "Current Index", value: `${Math.round(latestIndex)}%` },
                { label: "Change vs Last Week", value: chText, className: changePct >= 0 ? "text-green-600" : "text-red-600" },
                { label: "Active Event", value: summary?.event_name ? `${summary.event_name}` : "None" },
              ];
              return items.map((s, i) => (
                <div key={i} className="flex-1 bg-gray-50 rounded-xl p-3 text-center">
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
              <h2 className={styles.sectionTitle}>Academic Calendar</h2>
              <p className="text-xs text-[#6b7280] mt-1">Uploaded events, exams, and holidays appear directly on the calendar.</p>
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

      {/* Weekly Insights + Behavioral & Pattern Insights (side by side) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl shadow p-4 relative">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className={styles.sectionTitle}>Weekly Insights</h2>
              <p className="text-xs text-[#6b7280] mt-1">Data-informed highlights across wellness and engagement.</p>
            </div>
            <div className="flex items-center gap-2">
              <button className="p-1 rounded-full border hover:bg-gray-100" onClick={() => weeklySliderRef.current?.slickPrev()} aria-label="Previous insight">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button className="p-1 rounded-full border hover:bg-gray-100" onClick={() => weeklySliderRef.current?.slickNext()} aria-label="Next insight">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
          {insights.length === 0 ? (
            <div className="text-sm text-gray-500">No insights available.</div>
          ) : (
            <div className="relative pb-10">
              <Slider ref={weeklySliderRef} {...insightSliderSettings} className="weekly-insights-slider">
                {insights.map((insight, idx) => (
                  <div key={`${insight.week_start}-${idx}`} className="px-1 h-full">
                    <div className="rounded-2xl shadow-sm border bg-gray-50 p-4 text-sm flex h-full flex-col space-y-3 transition hover:shadow-md">
                      <div className="flex items-center justify-between text-xs text-[#6b7280]">
                        <span>{new Date(insight.week_start).toLocaleDateString()} - {new Date(insight.week_end).toLocaleDateString()}</span>
                        <span className="font-medium text-[#111827]">{insight.event_name ?? "No Event"}</span>
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-[#111827]">{insight.title}</h3>
                        <p className="text-[#374151] mt-1 leading-relaxed">{insight.description}</p>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-dashed border-primary/40">
                        <div className="text-xs uppercase tracking-wide text-primary font-semibold mb-1">Recommendation</div>
                        <p className="text-sm text-[#0f172a] leading-relaxed">{insight.recommendation}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </Slider>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border p-4 min-h-[260px] flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h2 className={styles.sectionTitle}>Behavioral & Pattern Insights</h2>
            <div className="flex items-center gap-2">
              <button className="p-1 rounded-full border hover:bg-gray-100" onClick={() => behaviorSliderRef.current?.slickPrev()} aria-label="Previous behavior insight">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button className="p-1 rounded-full border hover:bg-gray-100" onClick={() => behaviorSliderRef.current?.slickNext()} aria-label="Next behavior insight">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
          {behaviorInsights.length === 0 ? (
            <div className="text-sm text-gray-500 flex-1 flex items-center justify-center">No behavioral insights available.</div>
          ) : (
            <div className="relative pb-10 flex-1">
              <Slider
                ref={behaviorSliderRef}
                dots
                arrows={false}
                infinite={behaviorInsights.length > 1}
                autoplay={behaviorInsights.length > 1}
                autoplaySpeed={7000}
                adaptiveHeight={false}
                appendDots={(dots: React.ReactNode) => (
                  <div className="absolute bottom-3 left-0 right-0"><ul className="flex justify-center gap-2">{dots}</ul></div>
                )}
                customPaging={() => <span className="block h-2 w-2 rounded-full bg-gray-300" />}
              >
                {behaviorInsights.map((bi, idx) => (
                  <div key={idx} className="px-1">
                    <div className="rounded-2xl shadow-sm border bg-gray-50 p-4 text-sm">
                      <h3 className="text-base font-semibold text-[#111827] mb-1">{bi.title}</h3>
                      <p className="text-[#374151] leading-relaxed mb-3">{bi.description}</p>
                      {Array.isArray(bi.metrics) && bi.metrics.length > 0 && (
                        <div className="grid grid-cols-2 gap-2">
                          {bi.metrics.map((m, i) => (
                            <div key={i} className="bg-white rounded-lg border p-2 text-center">
                              <div className="text-[11px] text-[#6b7280]">{m.label}</div>
                              <div className="text-lg font-bold text-[#111827]">{m.value}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </Slider>
            </div>
          )}
        </div>
      </div>

      {/* Engagement Metrics (full width under paired sections) */}
      <div className="bg-white rounded-2xl shadow p-4 min-h-[260px] flex flex-col">
        <h3 className="text-[#333] font-semibold mb-3 text-sm">Engagement Metrics</h3>
        {!engagement ? (
          <div className="text-sm text-gray-500 flex-1 flex items-center justify-center">No engagement data available.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center flex-1">
            <div className="bg-gray-50 rounded-xl p-3 flex flex-col justify-center">
              <div className="text-[#6b7280] text-xs">Active Students (This Week)</div>
              <div className="text-xl font-bold text-[#111827]">{engagement.active_students_this_week}</div>
              <div className="text-xs text-[#6b7280]">Last Week: {engagement.active_students_last_week}</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 flex flex-col justify-center">
              <div className="text-[#6b7280] text-xs">Avg Check-ins / Student</div>
              <div className="text-xl font-bold text-[#111827]">{engagement.avg_checkins_per_student}</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 flex flex-col justify-center">
              <div className="text-[#6b7280] text-xs">Participation Change</div>
              <div className={`text-xl font-bold ${String(engagement.participation_change).startsWith('-') ? 'text-red-600' : 'text-green-600'}`}>{engagement.participation_change}</div>
            </div>
          </div>
        )}
      </div>
      {/* Concerns & Interventions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl shadow p-4">
          <h3 className="text-[#333] font-semibold mb-2 text-sm">Top Student Concerns</h3>
          <div className="space-y-2">
            {concerns.length === 0 ? (
              <div className="text-sm text-gray-500">No data for this period.</div>
            ) : (
              concerns.map((c, i) => (
                <div key={i}>
                  <div className="flex justify-between text-xs flex-wrap gap-1">
                    <span>{c.label}</span>
                    <span>{c.students} students</span>
                    <span>{c.percent}%</span>
                  </div>
                  <div className="h-2 bg-[#e5e5e5] rounded">
                    <div className="h-2 rounded" style={{ width: `${c.percent}%`, background: c.barColor }}></div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow p-4">
          <h3 className="text-[#333] font-semibold mb-2 text-sm">Intervention Success Rates</h3>
          {chatKpi ? (
            <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <div className="text-[#6b7280]">Chat Success</div>
                <div className="text-lg font-bold text-[#111827]">{chatKpi.overall_success_rate}%</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <div className="text-[#6b7280]">Avg. Duration</div>
                <div className="text-lg font-bold text-[#111827]">{chatKpi.average_conversation_duration_minutes}m</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <div className="text-[#6b7280]">Sessions</div>
                <div className="text-lg font-bold text-[#111827]">{chatKpi.total_sessions}</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <div className="text-[#6b7280]">Avg. Messages</div>
                <div className="text-lg font-bold text-[#111827]">{chatKpi.average_messages_per_conversation}</div>
              </div>
            </div>
          ) : (
            <div className="mb-3 text-sm text-gray-500">No chat sessions ended during this period.</div>
          )}
          <div className="space-y-2">
            {interventions.length === 0 ? (
              <div className="text-sm text-gray-500">No interventions recorded for this period.</div>
            ) : (
              interventions.map((i, idx) => (
                <div key={idx}>
                  <div className="flex justify-between text-xs flex-wrap gap-1">
                    <span>{i.label}</span>
                    <span>{i.participants} participants</span>
                    <span>{i.percent}%</span>
                  </div>
                  <div className="h-2 bg-[#e5e5e5] rounded">
                    <div className="h-2 rounded" style={{ width: `${i.percent}%`, background: i.barColor }}></div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Students Requiring Attention Table */}
      <div className="bg-white rounded-2xl shadow p-4 overflow-x-auto">
        <h3 className={styles.tableTitle}>
          <span className="mr-2">Students Requiring Attention</span>
          <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-medium">!</span>
        </h3>
        {attentionStudents.length === 0 ? (
          <div className="text-sm text-gray-500">No students require attention for this period.</div>
        ) : (
          <table className="w-full text-xs min-w-[600px]">
            <thead>
              <tr className="text-[#6b7280] border-b">
                <th className="py-2 text-left">Student</th>
                <th className="py-2 text-left">Risk Level</th>
                <th className="py-2 text-left">Score</th>
                <th className="py-2 text-left">Primary Concerns</th>
                <th className="py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {attentionStudents.map((student, i) => (
                <tr key={i} className="border-b">
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
                      title="Notify student"
                      className="cursor-pointer text-lg"
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
