import DashboardLayout from '../layouts/DashboardLayout';
import styles from './Reports.module.css';

type TopStat = {
  label: string;
  value: string | number;
  delta: string;
  deltaColor: string;
};

type RiskLevel = {
  label: string;
  className: string;
  count: number;
  change: string;
  changeColor: string;
};

type Alert = {
  student: string;
  risk: string;
  riskClass: string;
  time: string;
};

type SecondaryStat = {
  label: string;
  value: string;
  delta: string;
  deltaColor: string;
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
  lastContact: string;
  counselor: string;
};

function Reports({
  topStats = [
    { label: "Total Students", value: 1247, delta: "+12% from last month", deltaColor: "text-green-600" },
    { label: "Active Users", value: 892, delta: "+8% from last month", deltaColor: "text-green-600" },
    { label: "At-Risk Students", value: 23, delta: "+3 from last week", deltaColor: "text-red-600" },
    { label: "Avg. Wellness Score", value: 7.2, delta: "+0.3 from last month", deltaColor: "text-green-600" },
  ],
  riskLevels = [
    { label: "High Risk", className: styles.riskHigh, count: 8, change: "+2", changeColor: "text-red-600" },
    { label: "Medium Risk", className: styles.riskMedium, count: 15, change: "+1", changeColor: "text-yellow-700" },
    { label: "Low Risk", className: styles.riskLow, count: 45, change: "-3", changeColor: "text-green-600" },
    { label: "No Risk", className: styles.riskNone, count: 1179, change: "+12", changeColor: "text-red-600" },
  ],
  alerts = [
    { student: "Student #1247", risk: "High", riskClass: styles.alertHigh, time: "2 hours ago" },
    { student: "Student #0892", risk: "Medium", riskClass: styles.alertMedium, time: "5 hours ago" },
    { student: "Student #1156", risk: "Low", riskClass: styles.alertLow, time: "1 day ago" },
  ],
  secondaryStats = [
    { label: "Overall Mood", value: "7.2/10", delta: "+0.3 from last period", deltaColor: "text-green-600" },
    { label: "Stress Levels", value: "6.1/10", delta: "-0.3 from last period", deltaColor: "text-red-600" },
    { label: "Sleep Quality", value: "6.8/10", delta: "0.0 from last period", deltaColor: "text-[#6b7280]" },
    { label: "Social Connection", value: "7.5/10", delta: "+0.3 from last period", deltaColor: "text-green-600" },
  ],
  concerns = [
    { label: "Academic Pressure", students: 169, percent: 88, barColor: "#2563eb" },
    { label: "Financial Stress", students: 112, percent: 45, barColor: "#0d8c4f" },
    { label: "Social Anxiety", students: 94, percent: 38, barColor: "#2563eb" },
    { label: "Sleep Issues", students: 84, percent: 34, barColor: "#0d8c4f" },
    { label: "Family Problems", students: 55, percent: 22, barColor: "#2563eb" },
  ],
  interventions = [
    { label: "Mindfulness Training", participants: 45, percent: 87, barColor: "#0d8c4f" },
    { label: "Peer Support Groups", participants: 38, percent: 82, barColor: "#2563eb" },
    { label: "Sleep Hygiene Workshop", participants: 52, percent: 78, barColor: "#0d8c4f" },
    { label: "Stress Management Course", participants: 67, percent: 76, barColor: "#2563eb" },
    { label: "Time Management Training", participants: 29, percent: 71, barColor: "#0d8c4f" },
  ],
  attentionStudents = [
    {
      name: "Alex Thompson",
      risk: "High",
      riskClass: styles.riskHigh,
      score: "8.2/10",
      concerns: ["Mood decline", "Missed appointments", "+ more"],
      lastContact: "March 20, 2025",
      counselor: "Dr. Sarah Johnson",
    },
    {
      name: "Morgan Chen",
      risk: "High",
      riskClass: styles.riskHigh,
      score: "7.8/10",
      concerns: ["Academic stress", "Sleep issues", "+ more"],
      lastContact: "March 22, 2025",
      counselor: "Dr. Michael Chen",
    },
    {
      name: "Jordan Williams",
      risk: "Medium",
      riskClass: styles.riskMedium,
      score: "6.5/10",
      concerns: ["Financial stress", "Family issues"],
      lastContact: "March 18, 2025",
      counselor: "Dr. Emily Rodriguez",
    },
    {
      name: "Casey Martinez",
      risk: "Medium",
      riskClass: styles.riskMedium,
      score: "6.1/10",
      concerns: ["Relationship problems", "Academic pressure"],
      lastContact: "March 13, 2025",
      counselor: "Dr. Sarah Johnson",
    },
    {
      name: "Riley Johnson",
      risk: "Low",
      riskClass: styles.riskLow,
      score: "5.9/10",
      concerns: ["Social anxiety", "Low self-esteem"],
      lastContact: "March 19, 2025",
      counselor: "Dr. Michael Chen",
    },
  ],
}) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className={styles.headerTitle}>Reports & Analytics</h1>
        <p className={styles.headerSubtitle}>
          Comprehensive insights into student wellness and platform usage
        </p>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {topStats.map((stat, i) => (
          <div key={i} className="bg-white rounded-2xl shadow p-4">
            <div className="text-[#6b7280] text-sm">{stat.label}</div>
            <div className="text-2xl font-bold text-[#333]">{stat.value}</div>
            <div className={`text-xs mt-1 ${stat.deltaColor}`}>{stat.delta}</div>
          </div>
        ))}
        <div className="bg-white rounded-2xl shadow p-4 flex items-center justify-center">
          <button className="px-4 py-2 rounded-xl border text-[#333] hover:bg-[#e5e5e5] font-medium">
            Export
          </button>
        </div>
      </div>

      {/* Wellness Trends & Risk Assessment */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Wellness Trends */}
        <div className="bg-white rounded-2xl shadow p-4 col-span-2">
          <div className="flex justify-between items-center mb-2">
            <h2 className={styles.sectionTitle}>Wellness Trends</h2>
            <button className="px-3 py-1 rounded border text-[#333] hover:bg-[#e5e5e5] text-sm">
              Export Chart
            </button>
          </div>
          {/* Replace below with your chart component */}
          <div className="h-48 flex items-center justify-center text-[#6b7280]">
            <span>Chart goes here</span>
          </div>
          <div className="flex justify-between mt-4 text-sm">
            <div>
              <span className="font-bold text-[#333]">Current Average</span>
              <div className="text-lg font-bold text-[#333]">7.2/10</div>
            </div>
            <div>
              <span className="font-bold text-[#333]">Trend</span>
              <div className="text-lg font-bold text-green-600">+0.4</div>
            </div>
            <div>
              <span className="font-bold text-[#333]">Participation</span>
              <div className="text-lg font-bold text-[#333]">89%</div>
            </div>
          </div>
        </div>
        {/* Risk Assessment */}
        <div className="bg-white rounded-2xl shadow p-4">
          <h2 className={styles.sectionTitle + " mb-2"}>Risk Assessment</h2>
          <div className="space-y-2">
            {riskLevels.map((risk, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className={`px-2 py-1 rounded text-xs font-medium ${risk.className}`}>{risk.label}</span>
                <span className="text-[#333] font-medium">{risk.count} students</span>
                <span className={`text-xs ${risk.changeColor}`}>{risk.change}</span>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-[#333] mb-2">Recent Alerts</h3>
            <div className="space-y-1">
              {alerts.map((alert, i) => (
                <div key={i} className={`flex justify-between items-center px-2 py-1 rounded ${alert.riskClass}`}>
                  <span className="text-[#333] text-sm">{alert.student}</span>
                  <span className="text-xs font-bold">{alert.risk}</span>
                  <span className="text-xs text-[#6b7280]">{alert.time}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 text-right">
              <button className="text-[#2563eb] text-xs font-medium">View All Alerts</button>
            </div>
          </div>
        </div>
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {secondaryStats.map((stat, i) => (
          <div key={i} className="bg-white rounded-2xl shadow p-4">
            <div className="text-[#6b7280] text-sm">{stat.label}</div>
            <div className="text-xl font-bold text-[#333]">{stat.value}</div>
            <div className={`text-xs mt-1 ${stat.deltaColor}`}>{stat.delta}</div>
          </div>
        ))}
      </div>

      {/* Top Concerns & Intervention Success */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Student Concerns */}
        <div className="bg-white rounded-2xl shadow p-4">
          <h3 className="text-[#333] font-semibold mb-2 text-sm">Top Student Concerns</h3>
          <div className="space-y-2">
            {concerns.map((c, i) => (
              <div key={i}>
                <div className="flex justify-between text-xs">
                  <span>{c.label}</span>
                  <span>{c.students} students</span>
                  <span>{c.percent}%</span>
                </div>
                <div className="h-2 bg-[#e5e5e5] rounded">
                  <div className="h-2 rounded" style={{ width: `${c.percent}%`, background: c.barColor }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Intervention Success Rates */}
        <div className="bg-white rounded-2xl shadow p-4">
          <h3 className="text-[#333] font-semibold mb-2 text-sm">Intervention Success Rates</h3>
          <div className="space-y-2">
            {interventions.map((i, idx) => (
              <div key={idx}>
                <div className="flex justify-between text-xs">
                  <span>{i.label}</span>
                  <span>{i.participants} participants</span>
                  <span>{i.percent}%</span>
                </div>
                <div className="h-2 bg-[#e5e5e5] rounded">
                  <div className="h-2 rounded" style={{ width: `${i.percent}%`, background: i.barColor }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Students Requiring Attention Table */}
      <div className="bg-white rounded-2xl shadow p-4">
        <h3 className={styles.tableTitle}>
          <span className="mr-2">Students Requiring Attention</span>
          <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-medium">!</span>
        </h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[#6b7280] border-b">
              <th className="py-2 text-left">Student</th>
              <th className="py-2 text-left">Risk Level</th>
              <th className="py-2 text-left">Score</th>
              <th className="py-2 text-left">Primary Concerns</th>
              <th className="py-2 text-left">Last Contact</th>
              <th className="py-2 text-left">Counselor</th>
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
                <td>{student.lastContact}</td>
                <td>{student.counselor}</td>
                <td>
                  <span className="mr-2">🗒️</span>
                  <span className="mr-2">✉️</span>
                  <span>👁️</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

Reports.layout = (page: React.ReactNode) => <DashboardLayout>{page}</DashboardLayout>;
export default Reports;