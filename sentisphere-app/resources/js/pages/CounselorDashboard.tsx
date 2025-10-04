import { useEffect, useState, useRef } from "react";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import { motion } from "framer-motion";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useSidebar } from "../components/SidebarContext";
import styles from './CounselorDashboard.module.css';

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
  if (avg >= 8) return "Overall, students are feeling very positive and motivated this period.";
  if (avg >= 6) return "Students are generally in a good mood, with some positive trends.";
  if (avg >= 4) return "Mood is mixed. Some students may be experiencing stress or challenges.";
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
  const [appointments, setAppointments] = useState<any[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<any[]>([]);
  const [studentsMonitored, setStudentsMonitored] = useState(0);
  const [openAppointments, setOpenAppointments] = useState(0);
  const [sentimentPeriod, setSentimentPeriod] = useState<"week" | "month" | "year">("month");
  const [page, setPage] = useState(0);
  const [showMoodInfo, setShowMoodInfo] = useState(false);

  // Fetch from backend
  useEffect(() => {
    fetch("http://localhost:8001/api/mood-trend")
      .then((res) => res.json())
      .then(setMoodTrend)
      .catch(console.error);

    fetch("http://localhost:8001/api/appointments")
      .then((res) => res.json())
      .then(setAppointments)
      .catch(console.error);

    fetch("http://localhost:8001/api/recent-alerts")
      .then((res) => res.json())
      .then(setRecentAlerts)
      .catch(console.error);

    fetch("http://localhost:8001/api/students-monitored")
      .then((res) => res.json())
      .then(data => setStudentsMonitored(data.count))
      .catch(console.error);

    fetch("http://localhost:8001/api/open-appointments")
      .then((res) => res.json())
      .then(data => setOpenAppointments(data.count))
      .catch(console.error);
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
    fetch(`http://localhost:8001/api/sentiments?period=${sentimentPeriod}`)
      .then((res) => res.json())
      .then(setSentimentBreakdown)
      .catch(console.error);
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

  const currentWeek = getCurrentWeekString();
  const thisWeekCheckins = moodTrend.filter(m => m.week === currentWeek).length;

  // Paginate (3 per page)
  const itemsPerPage = 3;
  const startIndex = page * itemsPerPage;
  const paginatedMoodTrend = sortedMoodTrend.slice(startIndex, startIndex + itemsPerPage);
  // reverse so oldest on left

  const maxPage = Math.ceil(sortedMoodTrend.length / itemsPerPage) - 1;

  // AI summary for current page
  const moodSummary = getMoodSummary(paginatedMoodTrend);

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

  const getFirstPeriodWithData = async () => {
    for (const period of ["week", "month", "year"] as const) {
      const res = await fetch(`http://localhost:8001/api/sentiments?period=${period}`);
      const data = await res.json();
      if (data.length > 0) return period;
    }
    return "year"; // fallback if all are empty
  };

  return (
    <main
      className={`transition-all duration-200 ${
        open ? "pl-[17rem] p-6 space-y-6 bg-[#f9fafb] min-h-screen" : "pl-[4.5rem] p-6 space-y-6 bg-[#f9fafb] min-h-screen"
      } pt-6 pr-6 pb-6 w-full`}
      style={{ minHeight: "100vh" }}
    >
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="p-4 sm:p-6 space-y-6 max-w-full"
      >
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className={styles.headerTitle}>Counselor Dashboard</h1>
            <p className={styles.headerSubtitle}>
              Overview of student well-being, appointments, and risk signals.
            </p>
          </div>
          <div className="flex gap-2">
            <button className="flex items-center gap-2 px-3 py-2 border rounded-xl text-sm text-[#333] hover:bg-[#e5e5e5]">
              <Info className="h-4 w-4 text-[#2563eb]" /> Filters
            </button>
            <button className="flex items-center gap-2 px-3 py-2 border rounded-xl text-sm text-[#333] hover:bg-[#e5e5e5]">
              <ChevronRight className="h-4 w-4 text-[#0d8c4f]" /> Export Report
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Students Monitored"
            value={studentsMonitored}
            icon={<Info className="h-4 w-4 text-[#0d8c4f]" />}
          />
          <StatCard
            title="This Week Check-ins"
            value={thisWeekCheckins}
            icon={<Info className="h-4 w-4 text-[#2563eb]" />}
          />
          <StatCard
            title="Open Appointments"
            value={openAppointments}
            icon={<Info className="h-4 w-4 text-[#6b7280]" />}
          />
          <StatCard
            title="High-Risk Flags"
            value={recentAlerts.filter((a) => a.severity === "high" || a.severity === "critical").length}
            icon={<Info className="h-4 w-4 text-red-500" />}
          />
        </div>

        {/* Weekly Mood Trend - moved up and made more prominent */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Weekly Mood Trend (2/3 width on desktop) */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow p-4 w-full max-w-full">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                  <h2 className={styles.sectionTitle}>Weekly Mood Trend</h2>
                  <button
                    className="ml-2 p-1 rounded-full hover:bg-gray-100"
                    onClick={() => setShowMoodInfo((v) => !v)}
                    aria-label="Show mood summary"
                  >
                    <Info className="h-5 w-5 text-[#0d8c4f]" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className={`p-2 rounded-full border ${
                      page === 0
                        ? "opacity-40 cursor-not-allowed"
                        : "hover:bg-gray-100"
                    }`}
                    onClick={() => setPage((p) => Math.max(p - 1, 0))}
                    disabled={page === 0}
                  >
                    <ChevronLeft className="h-5 w-5 text-[#0d8c4f]" />
                  </button>
                  <button
                    className={`p-2 rounded-full border ${
                      page === maxPage
                        ? "opacity-40 cursor-not-allowed"
                        : "hover:bg-gray-100"
                    }`}
                    onClick={() => setPage((p) => Math.min(p + 1, maxPage))}
                    disabled={page === maxPage}
                  >
                    <ChevronRight className="h-5 w-5 text-[#0d8c4f]" />
                  </button>
                </div>
              </div>
              {showMoodInfo && (
                <div className="mb-2 p-3 bg-[#f5faff] rounded-lg text-[#2563eb] text-sm border border-[#b6e0fe]">
                  <strong>AI Summary:</strong> {moodSummary}
                </div>
              )}
              <div className="h-[350px] flex items-center justify-center">
                {paginatedMoodTrend.length === 0 ? (
                  <span className="text-gray-500 text-sm">No mood data available.</span>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={paginatedMoodTrend} margin={{ top: 20, right: 35, bottom: 40, left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
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
                      <YAxis domain={["auto", "auto"]} stroke="#0d8c4f" />
                      <RTooltip />
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
            </div>
          </div>


          {/* Recent Alerts (1/3 width on desktop) */}
          <div>
            <div className="bg-white rounded-2xl shadow p-4">
              <h3 className="font-semibold text-[#0d8c4f] text-lg mb-1">Recent Alerts</h3>
              <p className="text-[#6b7280] text-sm mb-3">Students who may need attention</p>
              <div className="space-y-3">
                {recentAlerts.map((alert, idx) => (
                  <div
                    key={alert.id}
                    className="flex items-center justify-between bg-[#f7fafd] rounded-xl px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <Info className={
                        alert.severity === "high" || alert.severity === "critical"
                          ? "h-4 w-4 text-red-500"
                          : alert.severity === "medium"
                          ? "h-4 w-4 text-yellow-500"
                          : "h-4 w-4 text-blue-500"
                      } />
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
              <button className="w-full mt-4 py-2 rounded-xl border text-[#0d8c4f] font-medium hover:bg-[#f5faff] text-sm">
                View All Alerts
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
          {/* Sentiment Breakdown (2/3 width on desktop) */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow p-4 w-full max-w-full">
              <div className="flex justify-between items-center mb-2">
                <h2 className={styles.sectionTitle}>
                  Sentiment Breakdown
                </h2>
                <div className="flex gap-2">
                  {(["week", "month", "year"] as const).map((p) => (
                    <button
                      key={p}
                      className={`px-3 py-1 rounded-lg text-sm font-medium border ${
                        sentimentPeriod === p
                          ? "bg-[#0d8c4f] text-white border-[#0d8c4f]"
                          : "bg-[#f5f5f5] text-[#0d8c4f] border-[#e5e5e5]"
                      } transition`}
                      onClick={() => setSentimentPeriod(p)}
                    >
                      {periodLabels[p]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-64 flex items-center justify-center">
                {sentimentBreakdown.length === 0 ? (
                  <span className="text-[#6b7280] text-sm">No sentiment data available for this period.</span>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        dataKey="value"
                        data={sentimentBreakdown}
                        outerRadius={100}
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {sentimentBreakdown.map((entry, i) => (
                          <Cell key={i} fill={entry.name === "positive" ? "#4ade80" : entry.name === "negative" ? "#f87171" : "#fbbf24"} />
                        ))}
                      </Pie>
                      <RTooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
          {/* Empty space or another section (1/3 width) */}
          <div></div>
        </div>

        {/* 🔹 Appointments */}
        <div className="bg-white rounded-2xl shadow p-4">
          <h2 className="text-lg font-semibold mb-4 text-[#0d8c4f]">Appointments</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {appointments.map((apt) => (
              <div key={apt.id} className={styles.appointmentCard}>
                <div className="flex justify-between items-center">
                  <span className="font-medium text-[#333]">{apt.student}</span>
                  <span className={styles.appointmentStatus}>{apt.status}</span>
                </div>
                <div className="text-xs text-[#6b7280]">{apt.id}</div>
                <div className="mt-2 text-sm text-[#333]">
                  <Info className="h-4 w-4 inline mr-1 text-[#2563eb]" />{" "}
                  {new Date(apt.date).toLocaleDateString()} • {apt.time}
                </div>
                <div className="text-sm mt-1 text-[#333]">
                  <Info className="h-4 w-4 inline mr-1 text-[#0d8c4f]" /> Counselor:{" "}
                  {apt.counselor}
                </div>
                {apt.notes && (
                  <div className="text-xs text-[#6b7280] mt-1">
                    <Info className="h-4 w-4 inline mr-1 text-[#2563eb]" />{" "}
                    {apt.notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </main>
  );
}
