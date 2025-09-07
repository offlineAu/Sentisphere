import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";
import {
  Activity,
  CalendarDays,
  Clock,
  Filter,
  MessageSquareText,
  TrendingUp,
  AlertTriangle,
  UserRound,
  BookOpen,
  Download,
  Home,
  MessageCircle,
  FileText,
  User,
} from "lucide-react";
import Sidebar from '../components/Sidebar';
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
        <TrendingUp className="h-3 w-3 text-[#2563eb]" /> {delta}
      </div>
    )}
  </div>
);

// -----------------------------
// Main Dashboard
// -----------------------------
export default function CounselorDashboard() {
  const [moodTrend, setMoodTrend] = useState<MoodPoint[]>([]);
  const [sentimentBreakdown, setSentimentBreakdown] = useState<
    SentimentBreakdown[]
  >([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [flaggedStudents, setFlaggedStudents] = useState<StudentFlag[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<any[]>([]);

  // Fetch from backend
  useEffect(() => {
    fetch("http://localhost:5000/api/mood-trend")
      .then((res) => res.json())
      .then(setMoodTrend)
      .catch(console.error);

    fetch("/api/sentiments")
      .then((res) => res.json())
      .then(setSentimentBreakdown)
      .catch(console.error);

    fetch("/api/appointments")
      .then((res) => res.json())
      .then(setAppointments)
      .catch(console.error);

    fetch("/api/flags")
      .then((res) => res.json())
      .then(setFlaggedStudents)
      .catch(console.error);

    fetch("http://localhost:5000/api/recent-alerts")
      .then((res) => res.json())
      .then(setRecentAlerts)
      .catch(console.error);
  }, []);

  const reversedMoodTrend = [...moodTrend].reverse();

  return (
    <div className="flex bg-[#f5f5f5] min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-64">
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
                <Filter className="h-4 w-4 text-[#2563eb]" /> Filters
              </button>
              <button className="flex items-center gap-2 px-3 py-2 border rounded-xl text-sm text-[#333] hover:bg-[#e5e5e5]">
                <Download className="h-4 w-4 text-[#0d8c4f]" /> Export Report
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Students Monitored"
              value={flaggedStudents.length}
              icon={<UserRound className="h-4 w-4 text-[#0d8c4f]" />}
            />
            <StatCard
              title="This Week Check-ins"
              value={moodTrend.length}
              icon={<Activity className="h-4 w-4 text-[#2563eb]" />}
            />
            <StatCard
              title="Open Appointments"
              value={appointments.filter((a) => a.status === "scheduled").length}
              icon={<CalendarDays className="h-4 w-4 text-[#6b7280]" />}
            />
            <StatCard
              title="High-Risk Flags"
              value={recentAlerts.filter((a) => a.severity === "high" || a.severity === "critical").length}
              icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
            />
          </div>

          {/* Weekly Mood Trend - moved up and made more prominent */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Weekly Mood Trend (2/3 width on desktop) */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-2xl shadow p-4 w-full max-w-full">
                <h2 className={styles.sectionTitle}>Weekly Mood Trend</h2>
                <div className="overflow-x-auto" style={{ minHeight: 250, maxHeight: 400 }}>
                  <div
                    style={{
                      width: Math.max(moodTrend.length * 120, 900),
                      minWidth: 900,
                      height: 350,
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={reversedMoodTrend}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="week" stroke="#6b7280" />
                        <YAxis domain={['auto', 'auto']} stroke="#6b7280" />
                        <RTooltip />
                        <Line
                          type="monotone"
                          dataKey="avgMood"
                          stroke="#2563eb"
                          strokeWidth={3}
                          dot={{ r: 6, stroke: "#2563eb", strokeWidth: 2, fill: "#fff" }}
                          activeDot={{ r: 8, fill: "#2563eb" }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
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
                        <AlertTriangle className={
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
                <button className="w-full mt-4 py-2 rounded-xl border text-[#2563eb] font-medium hover:bg-[#f5faff] text-sm">
                  View All Alerts
                </button>
              </div>
            </div>
          </div>

          {/* 🔹 Sentiment Breakdown */}
          <div className="bg-white rounded-2xl shadow p-4">
            <h2 className={styles.sectionTitle}>
              Sentiment Breakdown (30d)
            </h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    dataKey="value"
                    data={sentimentBreakdown}
                    outerRadius={100}
                    label
                  >
                    {sentimentBreakdown.map((_, i) => (
                      <Cell key={i} fill={i % 2 === 0 ? "#0d8c4f" : "#2563eb"} />
                    ))}
                  </Pie>
                  <RTooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
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
                    <CalendarDays className="h-4 w-4 inline mr-1 text-[#2563eb]" />{" "}
                    {new Date(apt.date).toLocaleDateString()} • {apt.time}
                  </div>
                  <div className="text-sm mt-1 text-[#333]">
                    <UserRound className="h-4 w-4 inline mr-1 text-[#0d8c4f]" /> Counselor:{" "}
                    {apt.counselor}
                  </div>
                  {apt.notes && (
                    <div className="text-xs text-[#6b7280] mt-1">
                      <MessageSquareText className="h-4 w-4 inline mr-1 text-[#2563eb]" />{" "}
                      {apt.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
