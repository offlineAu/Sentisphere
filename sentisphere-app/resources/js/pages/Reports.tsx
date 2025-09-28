import { useEffect, useState } from "react";
import DashboardLayout from "../layouts/DashboardLayout";
import styles from "./Reports.module.css";

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

function Reports() {
  const [loading, setLoading] = useState(true);
  const [topStats, setTopStats] = useState<TopStat[]>([]);
  const [riskLevels, setRiskLevels] = useState<RiskLevel[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [secondaryStats, setSecondaryStats] = useState<SecondaryStat[]>([]);
  const [concerns, setConcerns] = useState<Concern[]>([]);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [attentionStudents, setAttentionStudents] = useState<AttentionStudent[]>([]);

  useEffect(() => {
    fetch("http://localhost:8001/api/reports")
      .then((res) => res.json())
      .then((data) => {
        setTopStats(data.topStats || []);
        setRiskLevels(
          (data.riskLevels || []).map((r: any) => ({
            ...r,
            className:
              r.label.includes("High") ? styles.riskHigh :
              r.label.includes("Medium") ? styles.riskMedium :
              r.label.includes("Low") ? styles.riskLow :
              styles.riskNone,
          }))
        );
        setAlerts(
          (data.alerts || []).map((a: any) => ({
            ...a,
            riskClass:
              a.risk === "High" ? styles.alertHigh :
              a.risk === "Medium" ? styles.alertMedium :
              styles.alertLow,
          }))
        );
        setSecondaryStats(data.secondaryStats || []);
        setConcerns(data.concerns || []);
        setInterventions(data.interventions || []);
        setAttentionStudents(
          (data.attentionStudents || []).map((s: any) => ({
            ...s,
            riskClass:
              s.risk === "High" ? styles.riskHigh :
              s.risk === "Medium" ? styles.riskMedium :
              styles.riskLow,
          }))
        );
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching reports:", err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div>Loading Reports...</div>;
  }

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
          {/* Placeholder for chart */}
          <div className="h-48 flex items-center justify-center text-[#6b7280]">
            <span>Chart goes here</span>
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

      {/* Top Concerns & Interventions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

      {/* Students Requiring Attention */}
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
                  <span className={`px-2 py-1 rounded text-xs font-medium ${student.riskClass}`}>
                    {student.risk}
                  </span>
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
