import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, TrendingUp, AlertTriangle, UserRound, CalendarDays, Activity, Download, Filter } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip } from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import DashboardLayout from "../layouts/DashboardLayout";
import { LoadingSpinner } from "../components/loading-spinner";
import api from "../lib/api";
import styles from "./Reports.module.css";

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

type SecondaryStat = {
  label: string;
  value: string;
  delta?: string;
  deltaColor?: string;
};

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

type MoodTrendPoint = {
  week: string;
  avgMood: number;
};

function CustomWeekTick({ x, y, payload }: any) {
  const parts = payload.value.split("-");
  return (
    <g transform={`translate(${x},${y})`}>
      {parts.map((p: string, i: number) => (
        <text key={i} x={0} y={0} dy={20 + i * 16} textAnchor="middle" fill="#0d8c4f" fontSize={12}>
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
  const [secondaryStats, setSecondaryStats] = useState<SecondaryStat[]>([]);
  const [concerns, setConcerns] = useState<Concern[]>([]);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [interventionSummary, setInterventionSummary] = useState<{ total_alerts: number; resolved_alerts: number; success_rate: number } | null>(null);
  const [chatKpi, setChatKpi] = useState<{ overall_success_rate: number; total_sessions: number; successful_sessions: number; average_conversation_duration_minutes: number; average_messages_per_conversation: number } | null>(null);
  const [attentionStudents, setAttentionStudents] = useState<AttentionStudent[]>([]);
  const [moodTrendData, setMoodTrendData] = useState<MoodTrendPoint[]>([]);
  const [currentAvg, setCurrentAvg] = useState(0);
  const [trend, setTrend] = useState(0);
  const [participation, setParticipation] = useState(0);

  const [page, setPage] = useState(0);

  const itemsPerPage = 3;

  // --- Fetch mood trend ---
  useEffect(() => {
    api.get<any[]>(`/mood-trend`)
      .then(({ data }) => {
        setMoodTrendData(data || []);
        if ((data || []).length > 0) {
          const lastWeek = data[data.length - 1];
          const prevWeek = data.length > 1 ? data[data.length - 2] : lastWeek;
          setCurrentAvg(lastWeek.avgMood || 0);
          setTrend(Math.round((lastWeek.avgMood - prevWeek.avgMood) * 10) / 10);
        }
      })
      .catch(err => console.error(err));
  }, []);

  // --- Fetch participation ---
  useEffect(() => {
    api.get<{ participation: number }>(`/reports/participation`)
      .then(({ data }) => setParticipation(Number(data?.participation || 0)))
      .catch(err => console.error(err));
  }, []);

  // --- Fetch reports ---
  useEffect(() => {
    const fetchReports = async () => {
      try {
        const topRes = await api.get<any>(`/reports/top-stats`);
        const topData = topRes.data;

        const calcDelta = (current: number, previous: number) => {
          if (!previous) return { delta: "", deltaColor: "" };
          const change = ((current - previous) / previous) * 100;
          const sign = change >= 0 ? "+" : "";
          const color = change >= 0 ? "text-green-600" : "text-red-600";
          return { delta: `${sign}${change.toFixed(1)}%`, deltaColor: color };
        };

        const prevStats = { total_students: 1200, active_users: 850, at_risk_students: 20, avg_wellness_score: 7.0 };

        setTopStats([
          { label: "Total Students", value: topData.total_students, ...calcDelta(topData.total_students, prevStats.total_students) },
          { label: "Active Users", value: topData.active_users, ...calcDelta(topData.active_users, prevStats.active_users) },
          { label: "At-Risk Students", value: topData.at_risk_students, ...calcDelta(topData.at_risk_students, prevStats.at_risk_students) },
          { label: "Avg. Wellness Score", value: topData.avg_wellness_score, ...calcDelta(topData.avg_wellness_score, prevStats.avg_wellness_score) },
        ]);

        // Fetch alerts from unified endpoint for Risk Assessment card
        setAlertsLoading(true);
        setAlertsError(null);
        try {
          const res = await api.get<ApiAlert[]>(`/alerts`);
          const data = Array.isArray(res.data) ? res.data : [];
          // Sort newest first
          data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          setAlertsApi(data);
          // Fetch all alerts for totals (counts include all-time, not just recent)
          const allRes = await api.get<any[]>(`/all-alerts`);
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

        const moodRes = await api.get<any[]>(`/mood-trend`);
        const moodData = moodRes.data || [];
        const latestMood = moodData[moodData.length - 1]?.avgMood || 0;
        const previousMood = moodData[moodData.length - 2]?.avgMood || 0;
        const moodDelta = latestMood - previousMood;

        setSecondaryStats([
          { label: "Overall Mood", value: `${latestMood}/10`, delta: `${moodDelta >= 0 ? "+" : ""}${moodDelta.toFixed(1)}`, deltaColor: moodDelta >= 0 ? "text-green-600" : "text-red-600" },
        ]);

        const concernsRes = await api.get<any[]>(`/reports/concerns`);
        const concernsData = concernsRes.data || [];
        setConcerns(concernsData.map((c: any) => ({ ...c, barColor: "#2563eb" })));

        const interventionsRes = await api.get<any>(`/reports/interventions`);
        const interventionsData = interventionsRes.data || {};
        setInterventionSummary(interventionsData.summary || null);
        const byType = Array.isArray(interventionsData.by_type) ? interventionsData.by_type : [];
        setInterventions(byType.map((i: any) => ({ ...i, barColor: "#0d8c4f" })));

        // Chat-based KPI
        const kpiRes = await api.get<any>(`/analytics/intervention-success`);
        setChatKpi(kpiRes.data || null);

        const attentionRes = await api.get<any[]>(`/reports/attention`);
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
  }, []);

  if (loading) return (
    <div className="flex h-[80vh] w-full items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <LoadingSpinner size="lg" className="text-primary" />
        <p className="text-muted-foreground">Loading reports...</p>
      </div>
    </div>
  );

  const sortedMoodTrend = [...moodTrendData].sort((a, b) => a.week.localeCompare(b.week));
  const maxPage = Math.ceil(sortedMoodTrend.length / itemsPerPage) - 1;
  const startIndex = page * itemsPerPage;
  const paginatedMoodTrend = sortedMoodTrend.slice(startIndex, startIndex + itemsPerPage);

  return (
    <main
      className={`transition-all duration-200 bg-[#f9fafb] min-h-screen pt-1 pr-6 pb-6 w-full p-4 sm:p-5 space-y-5 max-w-full pl-6`}
      style={{ minHeight: "100vh" }}
    >
      {/* Header */}
      <div>
        <h1 className={styles.headerTitle}>Reports & Analytics</h1>
        <p className={styles.headerSubtitle}>
          Comprehensive insights into student wellness and platform usage
        </p>
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
          const baseCard = "rounded-2xl shadow p-4";
          const gradientGreen = "bg-gradient-to-br from-[#0ea768] to-[#0d8c4f] text-white";
          const gradientRed = "bg-gradient-to-br from-[#f87171] to-[#dc2626] text-white";
          const whiteCard = "bg-white hover:shadow-md transition";
          const cardClass = `${baseCard} ${isTotal ? gradientGreen : isRisk ? gradientRed : whiteCard}`;
          const titleClass = isTotal || isRisk ? "text-sm font-medium opacity-90" : "text-sm font-medium text-gray-600";
          const valueClass = isTotal || isRisk ? "text-3xl font-extrabold mt-1" : "text-xl font-bold text-gray-900";
          const deltaClass = isTotal || isRisk ? "text-xs opacity-90 mt-1 flex items-center gap-1" : `text-xs ${stat.deltaColor}`;

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

      {/* Wellness Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl shadow p-4 w-full max-w-full">
            <div className="flex justify-between items-center mb-2">
              <h2 className={styles.sectionTitle}>Wellness Trends</h2>
              <div className="flex items-center gap-2">
                <button
                  className={`p-2 rounded-full border ${page === 0 ? "opacity-40 cursor-not-allowed" : "hover:bg-gray-100"}`}
                  onClick={() => setPage(p => Math.max(p - 1, 0))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-5 w-5 text-[#0d8c4f]" />
                </button>
                <button
                  className={`p-2 rounded-full border ${page === maxPage ? "opacity-40 cursor-not-allowed" : "hover:bg-gray-100"}`}
                  onClick={() => setPage(p => Math.min(p + 1, maxPage))}
                  disabled={page === maxPage}
                >
                  <ChevronRight className="h-5 w-5 text-[#0d8c4f]" />
                </button>
              </div>
            </div>

            <div className="h-[350px] flex items-center justify-center">
              {paginatedMoodTrend.length === 0 ? (
                <span className="text-gray-500 text-sm">No wellness data available.</span>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={paginatedMoodTrend}
                    margin={{ top: 20, right: 35, bottom: 40, left: 20 }}
                  >
                    <defs>
                      <linearGradient id="moodGradientReports" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#16a34a" stopOpacity={0.85} />
                        <stop offset="100%" stopColor="#0d8c4f" stopOpacity={0.25} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="week" interval={0} tick={<CustomWeekTick />} stroke="#0d8c4f" />
                    <YAxis domain={["auto", "auto"]} stroke="#0d8c4f" />
                    <RTooltip />
                    <Area
                      type="monotone"
                      dataKey="avgMood"
                      baseValue="dataMin"
                      fill="url(#moodGradientReports)"
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

            {/* Stats Row */}
            <div className="flex flex-col sm:flex-row justify-between mt-4 gap-2">
              {[
                { label: "Overall Mood", value: secondaryStats[0]?.value || "0/10", delta: secondaryStats[0]?.delta, deltaColor: secondaryStats[0]?.deltaColor },
                { label: "Current Average", value: `${currentAvg}/10` },
                { label: "Trend", value: trend >= 0 ? `+${trend}` : trend, deltaColor: trend >= 0 ? "text-green-600" : "text-red-600" },
                { label: "Participation", value: `${participation}%` },
              ].map((s, i) => (
                <div key={i} className="flex-1 bg-gray-50 rounded-xl p-3 text-center">
                  <div className="text-[#6b7280] text-xs font-medium">{s.label}</div>
                  <div className="text-lg font-bold text-[#333]">{s.value}</div>
                  {s.delta && <div className={`text-xs mt-1 ${s.deltaColor || "text-gray-500"}`}>{s.delta}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Risk Assessment / Alerts */}
        <div className="bg-white rounded-2xl shadow p-4">
          <h2 className={styles.sectionTitle + " mb-2"}>Risk Assessment</h2>
          {/* Severity grouping computed from all alerts (all-alerts) */}
          {alertsLoading ? (
            <div className="text-sm text-gray-500 text-center py-2">Loading risk data…</div>
          ) : alertsError ? (
            <div className="text-sm text-red-600 text-center py-2">{alertsError}</div>
          ) : allAlertsApi.length === 0 ? (
            <div className="text-sm text-gray-500">No alerts yet.</div>
          ) : (
            <>
              {(() => {
                const counts = { High: 0, Medium: 0, Low: 0 } as Record<string, number>;
                const norm = (sev: string) => {
                  const s = (sev || '').toLowerCase();
                  if (s === 'critical' || s === 'high') return 'High';
                  if (s === 'medium') return 'Medium';
                  return 'Low';
                };
                allAlertsApi.forEach(a => { counts[norm(a.severity)]++; });
                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-700">High Risk</span>
                      <span className="text-[#333] font-medium">{counts.High} students</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-700">Medium Risk</span>
                      <span className="text-[#333] font-medium">{counts.Medium} students</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-700">Low Risk</span>
                      <span className="text-[#333] font-medium">{counts.Low} students</span>
                    </div>
                  </div>
                );
              })()}

              <div className="mt-4">
                <h3 className="text-sm font-semibold text-[#333] mb-2">Recent Alerts</h3>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  <AnimatePresence initial={false}>
                    {alertsApi
                      .slice(0, 8)
                      .map((a, i) => {
                        const level = ((sev: string) => {
                          const s = (sev || '').toLowerCase();
                          if (s === 'critical' || s === 'high') return { tag: 'High', cls: 'bg-red-100 text-red-700' };
                          if (s === 'medium') return { tag: 'Medium', cls: 'bg-yellow-100 text-yellow-700' };
                          return { tag: 'Low', cls: 'bg-green-100 text-green-700' };
                        })(a.severity);
                        const dt = new Date(a.created_at);
                        const formatted = new Intl.DateTimeFormat(undefined, {
                          month: 'short', day: '2-digit', year: 'numeric',
                          hour: 'numeric', minute: '2-digit'
                        }).format(dt);
                        return (
                          <motion.div
                            key={`${dt.getTime()}-${i}`}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6 }}
                            transition={{ duration: 0.18 }}
                            className={`flex justify-between items-center px-2 py-1 rounded`}
                          >
                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${level.cls}`}>{level.tag}</span>
                            <span className="text-xs text-[#6b7280]">{formatted}</span>
                          </motion.div>
                        );
                      })}
                  </AnimatePresence>
                </div>
                <div className="mt-2 text-right">
                  <button
                    className="text-[#2563eb] text-xs font-medium"
                    onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                  >
                    View Recent Alerts
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
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
                    <span role="button" title="Add note">🗒️</span>
                    <span role="button" title="Email">✉️</span>
                    <span role="button" title="View">👁️</span>
                    <button
                      className="px-2 py-1 text-xs rounded bg-[#0d8c4f] text-white hover:opacity-90"
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
                      Notify
                    </button>
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
