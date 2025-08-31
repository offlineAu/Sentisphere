import { useEffect, useState } from "react";
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

  // Fetch from backend
  useEffect(() => {
    fetch("/api/mood-trend")
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
  }, []);

  return (
    <div className="flex bg-[#f5f5f5] min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-64">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="p-6 space-y-6"
        >
          {/* 🔹 Header */}
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

          {/* 🔹 Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
              value={flaggedStudents.filter((s) => s.risk === "high").length}
              icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
            />
          </div>

          {/* 🔹 Weekly Mood Trend */}
          <div className="bg-white rounded-2xl shadow p-4">
            <h2 className={styles.sectionTitle}>Weekly Mood Trend</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={moodTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="week" stroke="#6b7280" />
                  <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} stroke="#6b7280" />
                  <RTooltip />
                  <Area
                    type="monotone"
                    dataKey="avgMood"
                    stroke="#2563eb"
                    fill="#2563eb20"
                  />
                </AreaChart>
              </ResponsiveContainer>
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
