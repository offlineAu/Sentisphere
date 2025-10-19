import { useEffect, useState, useRef } from "react";
import { ChevronLeft, ChevronRight, Info, Users, CalendarCheck, CalendarClock, AlertTriangle, AlertCircle, Bell, Search, Mail, Percent as PercentIcon, Hash as HashIcon } from "lucide-react";
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
import styles from './CounselorDashboard.module.css';
const API_BASE = (import.meta as any).env?.VITE_API_URL || "";

// -----------------------------
// Types
// -----------------------------
type StudentRisk = "low" | "medium" | "high";

interface Appointment {
  id: string;
  student: string;
  date: string;
  time: string;
  counselor: string;
  status: "scheduled" | "completed" | "no-show" | "cancelled";
  notes?: string;
}

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

// -----------------------------
// Components
// -----------------------------
const riskBadge = (risk: StudentRisk) => {
  const color =
    risk === "high"
      ? "bg-red-100 text-red-700"
      : risk === "medium"
      ? "bg-yellow-100 text-yellow-700"
      : "bg-[#e5e5e5] text-[#0d8c4f]"; // palette for low risk
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
}> = ({ title, value, icon, delta }) => (
  <div className="bg-white rounded-2xl shadow p-4 hover:shadow-md transition">
    <div className="flex items-center justify-between">
      <h3 className={styles.statCardTitle}>{title}</h3>
      {icon}
    </div>
    <div className={styles.statCardValue}>{value}</div>
    {delta && (
      <div className={styles.statCardDelta}>
        <ChevronRight className="h-3 w-3 text-[#2563eb]" /> {delta}
      </div>
    )}
  </div>
);

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

// -----------------------------
// Main Dashboard
// -----------------------------
export default function CounselorDashboard() {
  const { open } = useSidebar();
  const [moodTrend, setMoodTrend] = useState<any[]>([]);
  const [sentimentBreakdown, setSentimentBreakdown] = useState<any[]>([]);
  const [checkinBreakdown, setCheckinBreakdown] = useState<{ mood: any[]; energy: any[]; stress: any[] } | null>(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [appointmentLogs, setAppointmentLogs] = useState<any[]>([]);
  const [userActivities, setUserActivities] = useState<any[]>([]);
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

  const moodScale = [
    { value: 1, label: 'Very Sad' },
    { value: 2, label: 'Sad' },
    { value: 3, label: 'Neutral' },
    { value: 4, label: 'Good' },
    { value: 5, label: 'Happy' },
    { value: 6, label: 'Very Happy' },
    { value: 7, label: 'Excellent' },
  ];

  const labelForScore = (v: number) => {
    const found = moodScale.find((m) => m.value === Math.round(v));
    return found ? found.label : String(v);
  };

  // Fetch from backend
  useEffect(() => {
    fetch(`${API_BASE}/api/mood-trend`)
      .then((res) => res.json())
      .then(setMoodTrend)
      .catch(console.error);

    fetch(`${API_BASE}/api/appointments`)
      .then((res) => res.json())
      .then(setAppointments)
      .catch(console.error);

    fetch(`${API_BASE}/api/recent-alerts`)
      .then((res) => res.json())
      .then(data => setRecentAlerts(data))
      .catch(console.error);

    fetch(`${API_BASE}/api/all-alerts`)
      .then((res) => res.json())
      .then(data => setAllAlerts(data))
      .catch(console.error);

    fetch(`${API_BASE}/api/students-monitored`)
      .then((res) => res.json())
      .then(data => setStudentsMonitored(data.count))
      .catch(console.error);

    fetch(`${API_BASE}/api/open-appointments`)
      .then((res) => res.json())
      .then(data => setOpenAppointments(data.count))
      .catch(console.error);

    fetch(`${API_BASE}/api/this-week-checkins`)
      .then(res => res.json())
      .then(data => setThisWeekCheckins(data.count))
      .catch(console.error);

    fetch(`${API_BASE}/api/high-risk-flags`)
      .then(res => res.json())
      .then(data => setHighRiskFlags(data.count))
      .catch(console.error);

    // New: appointment logs and user activities (mobile appointment page interactions)
    fetch(`${API_BASE}/api/appointment-logs`)
      .then(res => res.json())
      .then(data => setAppointmentLogs(data))
      .catch(console.error);

    fetch(`${API_BASE}/api/user-activities?target_type=appointment`)
      .then(res => res.json())
      .then(data => setUserActivities(data))
      .catch(console.error);

    // Counselor profile
    const counselorId = (import.meta as any).env?.VITE_COUNSELOR_USER_ID || 1;
    fetch(`${API_BASE}/api/counselor-profile?user_id=${counselorId}`)
      .then(res => res.json())
      .then(setCounselor)
      .catch(console.error);

    // Unread messages count (badge)
    fetch(`${API_BASE}/api/unread-messages`)
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(data => {
        if (typeof data?.count === 'number') setUnreadMessages(data.count);
      })
      .catch(() => setUnreadMessages(0));

    // Initial AI summaries (safe to ignore errors)
    fetch(`${API_BASE}/api/ai/sentiment-summary?period=${sentimentPeriod}`)
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(d => setAiSentimentSummary(d?.summary || null))
      .catch(() => setAiSentimentSummary(null));
    fetch(`${API_BASE}/api/ai/mood-summary?period=${sentimentPeriod}`)
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(d => setAiMoodSummary(d?.summary || null))
      .catch(() => setAiMoodSummary(null));
  }, []);

  // Only run this on initial mount
  useEffect(() => {
    let isMounted = true;
    getFirstPeriodWithData().then((period) => {
      if (isMounted) setSentimentPeriod(period);
    });
    return () => { isMounted = false; };
  }, []);

  // Fetch sentiment breakdown when sentimentPeriod changes
  useEffect(() => {
    fetch(`${API_BASE}/api/sentiments?period=${sentimentPeriod}`)
      .then((res) => res.json())
      .then(setSentimentBreakdown)
      .catch(console.error);
    fetch(`${API_BASE}/api/checkin-breakdown?period=${sentimentPeriod}`)
      .then(res => res.json())
      .then(setCheckinBreakdown)
      .catch(console.error);
    // Refresh AI summaries for the selected period
    fetch(`${API_BASE}/api/ai/sentiment-summary?period=${sentimentPeriod}`)
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(d => setAiSentimentSummary(d?.summary || null))
      .catch(() => setAiSentimentSummary(null));
    fetch(`${API_BASE}/api/ai/mood-summary?period=${sentimentPeriod}`)
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(d => setAiMoodSummary(d?.summary || null))
      .catch(() => setAiMoodSummary(null));
  }, [sentimentPeriod]);

  const parseWeekString = (weekStr: string) => {
    const [yearStr, monthStr, weekLabel] = weekStr.split("-");
    const year = parseInt(yearStr, 10);
    const month = new Date(`${monthStr} 1, ${year}`).getMonth(); // 0-based month
    const week = parseInt(weekLabel.replace(/\D/g, ""), 10);

    return { year, month, week };
  };

  const sortedMoodTrend = [...moodTrend].sort((a, b) => {
    const pa = parseWeekString(a.week);
    const pb = parseWeekString(b.week);

    if (pb.year !== pa.year) return pb.year - pa.year;
    if (pb.month !== pa.month) return pb.month - pa.month;
    return pb.week - pa.week; // ascending week, W5 > W1
  });

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
  const paginatedMoodTrend = sortedMoodTrend.slice(startIndex, startIndex + itemsPerPage);
  // reverse so oldest on left

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
          <Line type="monotone" dataKey="mood" stroke="#0d8c4f" />
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
            fill="#0d8c4f"
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

  // Simple dark tooltip to mimic the sample's small percentage badge
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const p0 = payload[0];
      const pl = p0?.payload || {};
      const percent = typeof pl.percent === 'number' ? pl.percent : (typeof p0?.value === 'number' ? p0.value : 0);
      const label = pl.label || pl.name;
      const value = typeof pl.value === 'number' ? pl.value : undefined;
      return (
        <div style={{
          background: '#111827',
          color: '#fff',
          padding: '1px 4px',
          borderRadius: 4,
          fontSize: 12,
          boxShadow: 'none'
        }}>
          {label ? `${label}: ${value ?? ''}${value !== undefined ? ' (' + percent + '%)' : percent + '%'}` : `${percent}%`}
        </div>
      );
    }
    return null;
  };

  const getFirstPeriodWithData = async () => {
    for (const period of ["week", "month", "year"] as const) {
      const res = await fetch(`${API_BASE}/api/sentiments?period=${period}`);
      const data = await res.json();
      if (data.length > 0) return period;
    }
    return "year"; // fallback if all are empty
  };

  return (
    <main
      className={`transition-all duration-200 ${
        open ? "pl-[17rem] p-6 space-y-4 bg-[#f9fafb] min-h-screen" : "pl-[4.5rem] p-6 space-y-5 bg-[#f9fafb] min-h-screen"
      } pt-1 pr-6 pb-6 w-full`}
      style={{ minHeight: "100vh" }}
    >
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="p-4 sm:p-5 space-y-5 max-w-full"
      >
        {/* Header with search + message + profile */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div className={styles.searchBar}>
              <Search className={styles.searchIcon} />
              <input className={styles.searchInput} placeholder="Search" />
            </div>
            <div className="flex items-center gap-3">
              <button className={`${styles.pill} ${styles.pillSecondary} relative`} title="Messages" onClick={() => (window.location.href = '/chat')}>
                <Mail className="h-4 w-4 text-[#0d8c4f]" />
                {unreadMessages > 0 && (
                  <span className={styles.badge}>{unreadMessages}</span>
                )}
              </button>
              <div className={styles.profileChip} onClick={() => (window.location.href = '/profile')} role="button" tabIndex={0}>
                <div className={styles.avatarCircle}>
                  {(counselor?.initials) || (counselor?.name ? counselor.name.split(' ').map((n: string) => n[0]).slice(0,2).join('') : 'C')}
                </div>
                <div>
                  <div className={styles.profileName}>{counselor?.name || 'Counselor'}</div>
                  <div className={styles.profileEmail}>{counselor?.email || ''}</div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h1 className={styles.headerTitle}>Counselor Dashboard</h1>
            <p className={styles.headerSubtitle}>
              Overview of student well-being, appointments, and risk signals.
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Gradient card for Students Monitored */}
          <div className="rounded-2xl shadow p-4 bg-gradient-to-br from-[#0ea768] to-[#0d8c4f] text-white">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium opacity-90">Students Monitored</h3>
              <Users className="h-4 w-4 opacity-90" />
            </div>
            <div className="text-3xl font-extrabold mt-1">{studentsMonitored}</div>
            <div className="text-xs opacity-90 mt-1 flex items-center gap-1">
              <ChevronRight className="h-3 w-3" /> Updated today
            </div>
          </div>
          <StatCard
            title="This Week Check-ins"
            value={thisWeekCheckins}
            icon={<CalendarCheck className="h-4 w-4 text-[#2563eb]" />}
          />
          <StatCard
            title="Open Appointments"
            value={openAppointments}
            icon={<CalendarClock className="h-4 w-4 text-[#6b7280]" />}
          />
          <StatCard
            title="High-Risk Flags"
            value={highRiskFlags}
            icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
          />
        </div>

        {/* Weekly Mood Analytics - moved up and made more prominent */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Weekly Mood Trend (2/3 width on desktop) */}
          <div className="lg:col-span-2">
            <div className={`${styles.card} p-4 w-full max-w-full`}>
              <div className={`${styles.cardHeader}`}>
                <div className="flex items-center gap-2">
                  <h2 className={styles.sectionTitle}>Weekly Mood Analytics</h2>
                  <img
                    src="https://cdn-icons-png.flaticon.com/512/8763/8763670.png"
                    alt="summary"
                    title={aiMoodSummary || getMoodSummary(paginatedMoodTrend)}
                    className={styles.summaryIconImg}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className={`${styles.pill} ${styles.pillSecondary} ${page === 0 ? "opacity-40 cursor-not-allowed" : ""}`}
                    onClick={() => setPage((p) => Math.max(p - 1, 0))}
                    disabled={page === 0}
                  >
                    <ChevronLeft className="h-5 w-5 text-[#0d8c4f]" />
                  </button>
                  <button
                    className={`${styles.pill} ${styles.pillSecondary} ${page === maxPage ? "opacity-40 cursor-not-allowed" : ""}`}
                    onClick={() => setPage((p) => Math.min(p + 1, maxPage))}
                    disabled={page === maxPage}
                  >
                    <ChevronRight className="h-5 w-5 text-[#0d8c4f]" />
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
                          <stop offset="0%" stopColor="#16a34a" stopOpacity={0.85} />
                          <stop offset="100%" stopColor="#0d8c4f" stopOpacity={0.25} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="week"
                        stroke="#0d8c4f"
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
                                  fill="#0d8c4f"
                                  fontSize={12}
                                >
                                  {p}
                                </text>
                              ))}
                            </g>
                          );
                        }}
                      />
                      <YAxis domain={[1, 7]} ticks={[1,2,3,4,5,6,7]} tickFormatter={(v) => labelForScore(Number(v))} stroke="#0d8c4f" />
                      <RTooltip content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const val = payload[0].value as number;
                          return (
                            <div style={{ background: '#111827', color: '#fff', padding: '4px 8px', borderRadius: 4, fontSize: 12 }}>
                              {`${val.toFixed(2)} (${labelForScore(val)})`}
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
                        type="monotone"
                        dataKey="avgMood"
                        stroke="#0d8c4f"
                        strokeWidth={3}
                        dot={{ r: 6, stroke: "#0d8c4f", strokeWidth: 2, fill: "#fff" }}
                        activeDot={{ r: 8, fill: "#0d8c4f" }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="mt-2 text-xs text-[#6b7280]">Scale: 1 = Very Sad, 2 = Sad, 3 = Neutral, 4 = Good, 5 = Happy, 6 = Very Happy, 7 = Excellent</div>
            </div>
          </div>


          {/* Recent Alerts (1/3 width on desktop) */}
          <div>
            <div className="bg-white rounded-2xl shadow p-4">
              <h3 className="font-semibold text-[#0d8c4f] text-lg mb-1">Recent Alerts</h3>
              <p className="text-[#6b7280] text-sm mb-3">Students who may need attention</p>
              <div className="space-y-3">
                {recentAlerts.slice(0, 3).map((alert, idx) => (
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
                          {alert.reason} • {new Date(alert.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <span className="text-[#bdbdbd] text-xl">&rarr;</span>
                  </div>
                ))}
              </div>
              <button
                className="w-full mt-4 py-2 rounded-xl border-2 border-[#0d8c4f] text-[#0d8c4f] font-semibold bg-gradient-to-r from-[#e0f7ef] to-[#f5faff] hover:scale-105 hover:shadow-lg transition-all duration-150 text-base flex items-center justify-center gap-2"
                onClick={() => setShowAllAlerts(true)}
              >
                <Info className="h-5 w-5 text-[#0d8c4f]" />
                View All Alerts
              </button>
            </div>
          </div>
        </div>

        {showAllAlerts && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-transparent bg-opacity-30">
            <div className="bg-white rounded-2xl shadow-lg p-6 max-w-lg w-full relative">
              <button
                className="absolute top-2 right-2 text-[#0d8c4f] text-xl"
                onClick={() => setShowAllAlerts(false)}
                aria-label="Close"
              >
                &times;
              </button>
              <h2 className="text-lg font-semibold mb-4 text-[#0d8c4f]">All Alerts</h2>
              <div className="max-h-[60vh] overflow-y-auto space-y-3">
                {recentAlerts.length === 0 ? (
                  <div className="text-gray-500 text-sm">No alerts available.</div>
                ) : (
                  allAlerts.map((alert, idx) => (
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
                            {alert.reason} • {new Date(alert.created_at).toLocaleDateString()}
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Sentiment Breakdown (2/3 width on desktop) */}
          <div className="lg:col-span-2">
            <div className={`${styles.card} p-4 w-full max-w-full`}>
              <div className={`${styles.cardHeader}`}>
                <div className="flex items-center gap-2">
                  <h2 className={styles.sectionTitle}>Sentiment Breakdown</h2>
                  <img
                    src="https://cdn-icons-png.flaticon.com/512/8763/8763670.png"
                    alt="summary"
                    title={(function(){
                      const order = ["positive","neutral","negative"] as const;
                      const incoming: Record<string, number> = Object.fromEntries(
                        sentimentBreakdown.map((d: any) => [String(d.name).toLowerCase(), Number(d.value) || 0])
                      );
                      const total = order.reduce((s,k)=>s+(incoming[k]||0),0);
                      if(!total) return 'No sentiment data.';
                      const pct = (k: typeof order[number]) => Math.round(((incoming[k]||0)/total)*100);
                      const fallback = `Overall this period: Positive ${pct('positive')}%, Neutral ${pct('neutral')}%, Negative ${pct('negative')}%`;
                      return aiSentimentSummary || fallback;})()}
                    className={styles.summaryIconImg}
                  />
                </div>
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
                  const data = order.map((k) => ({
                    name: k,
                    value: incoming[k] || 0,
                    percent: total > 0 ? Math.round(((incoming[k] || 0) / total) * 100) : 0,
                  }));
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
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-[#0d8c4f] text-base">Check-in Breakdown</h3>
                  <div className="flex items-center gap-1 bg-[#f7fafd] rounded-xl p-1">
                    <button
                      className={`${styles.pill} ${checkinLabelMode === 'count' ? styles.pillPrimary : styles.pillSecondary}`}
                      onClick={() => setCheckinLabelMode('count')}
                      aria-label="Show counts"
                      title="Show counts"
                    >
                      <HashIcon className="h-4 w-4" />
                    </button>
                    <button
                      className={`${styles.pill} ${checkinLabelMode === 'percent' ? styles.pillPrimary : styles.pillSecondary}`}
                      onClick={() => setCheckinLabelMode('percent')}
                      aria-label="Show percentages"
                      title="Show percentages"
                    >
                      <PercentIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {(() => {
                    const sections = [
                      {
                        title: 'Mood',
                        key: 'mood' as const,
                        order: ['Very Sad','Sad','Neutral','Good','Happy','Very Happy', 'Excellent'],
                      },
                      {
                        title: 'Energy',
                        key: 'energy' as const,
                        order: ['Very Low','Low','Moderate','High','Very High'],
                      },
                      {
                        title: 'Stress',
                        key: 'stress' as const,
                        order: ['No Stress','Low Stress','Moderate','High Stress','Very High Stress'],
                      },
                    ];
                    return sections.map((sec) => {
                      const raw = (checkinBreakdown?.[sec.key] || []) as Array<{label: string; value: number}>;
                      const map = Object.fromEntries(raw.map((r) => [r.label, r.value]));
                      const total = Object.values(map).reduce((a: number, b: number) => a + (Number(b) || 0), 0);
                      const d = sec.order.map((label) => ({
                        label,
                        value: map[label] || 0,
                        percent: total > 0 ? Math.round(((map[label] || 0) / total) * 100) : 0,
                      }));
                      return (
                        <div key={sec.title} className="bg-[#f7fafd] rounded-xl p-3">
                          <div className="text-sm font-medium text-[#0d8c4f] mb-2">{sec.title}</div>
                          <div style={{ height: 180 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={d} margin={{ top: 6, right: 4, bottom: 14, left: 0 }} barCategoryGap={4}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                                <XAxis
                                  dataKey="label"
                                  interval={0}
                                  height={46}
                                  tickLine={false}
                                  axisLine={false}
                                  tick={<MultiLineTick />}
                                />
                                <YAxis hide domain={[0, (dataMax: number) => (typeof dataMax === 'number' ? dataMax : 0) * 1.18]} />
                                <RTooltip content={<CustomTooltip />} wrapperStyle={{ padding: 0, border: 'none', background: 'transparent' }} />
                                <Bar dataKey="value" radius={[8,8,8,8]} barSize={22} isAnimationActive animationDuration={600}>
                                  {checkinLabelMode === 'percent' ? (
                                    <LabelList dataKey="percent" position="top" fill="#6b7280" offset={4} formatter={(v: any) => `${Number(v||0)}%`} />
                                  ) : (
                                    <LabelList dataKey="value" position="top" fill="#6b7280" offset={4} formatter={(v: any) => `${Number(v||0)}`} />
                                  )}
                                  {d.map((entry, idx) => (
                                    <Cell key={idx} fill={sec.key === 'mood' ? '#10b981' : sec.key === 'energy' ? '#3b82f6' : '#ef4444'} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          </div>
          {/* Project-style side rail: Activities Snapshot */}
          <div className={`${styles.card} p-4 h-full`}>
            <h3 className="font-semibold text-[#0d8c4f] text-lg mb-2">Appointment Activities</h3>
            <div className="space-y-3 max-h-[18rem] overflow-y-auto pr-1">
              {userActivities.length === 0 ? (
                <div className="text-[#6b7280] text-sm">No recent activities.</div>
              ) : (
                userActivities.slice(0, 8).map((act) => (
                  <div key={act.activity_id} className={`${styles.tileRow}`}>
                    <div>
                      <div className="text-sm font-semibold text-[#333]">{act.action}</div>
                      <div className="text-xs text-[#6b7280]">Target: {act.target_type} #{act.target_id}</div>
                      <div className="text-[11px] text-[#94a3b8]">{new Date(act.created_at || act.started_at).toLocaleString()}</div>
                    </div>
                    <span className="text-[#bdbdbd] text-xl">→</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* 🔹 Appointments & Logs */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className={`${styles.card} p-4`}>
            <h2 className="text-lg font-semibold mb-4 text-[#0d8c4f]">Upcoming Appointments</h2>
            <div className="grid md:grid-cols-2 gap-4">
              {appointments.length === 0 ? (
                <div className="text-[#6b7280] text-sm">No appointments scheduled.</div>
              ) : (
                appointments.slice(0, 6).map((apt) => (
                  <div key={apt.id} className={styles.appointmentCard}>
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-[#111827]">{apt.student}</span>
                      <span className={styles.appointmentStatus}>{apt.status}</span>
                    </div>
                    <div className="text-xs text-[#6b7280]">ID: {apt.id}</div>
                    <div className="mt-2 text-sm text-[#111827]">
                      <Info className="h-4 w-4 inline mr-1 text-[#2563eb]" />
                      {new Date(apt.date).toLocaleDateString()} • {apt.time}
                    </div>
                    <div className="text-sm mt-1 text-[#111827]">
                      <Info className="h-4 w-4 inline mr-1 text-[#0d8c4f]" /> Counselor: {apt.counselor}
                    </div>
                    {apt.notes && (
                      <div className="text-xs text-[#6b7280] mt-1">
                        <Info className="h-4 w-4 inline mr-1 text-[#2563eb]" />
                        {apt.notes}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className={`${styles.card} p-4`}>
            <h2 className="text-lg font-semibold mb-4 text-[#0d8c4f]">Appointment Logs</h2>
            <div className="space-y-3 max-h-[24rem] overflow-y-auto pr-1">
              {appointmentLogs.length === 0 ? (
                <div className="text-[#6b7280] text-sm">No logs yet.</div>
              ) : (
                appointmentLogs.slice(0, 12).map((log) => (
                  <div key={log.log_id} className={`${styles.tileRow}`}>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[#111827]">{log.form_type || 'Form'} downloaded</div>
                      <div className="text-xs text-[#6b7280]">User #{log.user_id} • {new Date(log.downloaded_at).toLocaleString()}</div>
                      {log.remarks && <div className="text-[11px] text-[#94a3b8] truncate">{log.remarks}</div>}
                    </div>
                    <span className="text-[#bdbdbd] text-xl">↓</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </main>
  );
}
