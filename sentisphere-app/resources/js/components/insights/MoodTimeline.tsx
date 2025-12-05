import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface MoodDataPoint {
  date: string;
  avg_mood_score: number;
}

interface MoodTrends {
  daily: MoodDataPoint[];
  trend: 'improving' | 'worsening' | 'stable';
  week_avg?: number;
  prev_week_avg?: number | null;
  change_percent?: number | null;
}

interface MoodTimelineProps {
  moodTrends: MoodTrends;
  height?: number;
  showTrendBadge?: boolean;
  showAverage?: boolean;
}

const trendConfig = {
  improving: {
    color: 'text-green-600',
    bg: 'bg-green-50',
    icon: TrendingUp,
    label: 'Improving',
  },
  worsening: {
    color: 'text-red-600',
    bg: 'bg-red-50',
    icon: TrendingDown,
    label: 'Declining',
  },
  stable: {
    color: 'text-gray-600',
    bg: 'bg-gray-50',
    icon: Minus,
    label: 'Stable',
  },
};

export function MoodTimeline({
  moodTrends,
  height = 120,
  showTrendBadge = true,
  showAverage = true,
}: MoodTimelineProps) {
  const { daily, trend, week_avg, change_percent } = moodTrends;
  const config = trendConfig[trend] || trendConfig.stable;
  const TrendIcon = config.icon;

  const chartData = useMemo(() => {
    return daily.map((d) => ({
      ...d,
      // Format date for display
      label: new Date(d.date).toLocaleDateString('en-US', { weekday: 'short' }),
    }));
  }, [daily]);

  const minScore = useMemo(() => {
    const min = Math.min(...daily.map((d) => d.avg_mood_score));
    return Math.max(0, min - 10);
  }, [daily]);

  const maxScore = useMemo(() => {
    const max = Math.max(...daily.map((d) => d.avg_mood_score));
    return Math.min(100, max + 10);
  }, [daily]);

  if (!daily.length) {
    return (
      <div
        className="flex items-center justify-center bg-gray-50 rounded-lg"
        style={{ height }}
      >
        <span className="text-gray-400 text-sm">No mood data available</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Trend Badge */}
      {showTrendBadge && (
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-600 flex items-center gap-1">
            Mood Trend
            <span className="text-[10px] text-blue-500 cursor-help" title="Daily mood scores (0-100) based on student check-ins. The trend shows if mood is improving, declining, or stable compared to the previous week.">ⓘ</span>
          </span>
          <div className="flex items-center gap-2">
            <span
              className={`
                inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold cursor-help
                ${config.bg} ${config.color}
              `}
              title={`Mood is ${config.label.toLowerCase()} compared to the previous week`}
            >
              <TrendIcon className="h-3 w-3" />
              {config.label}
            </span>
            {change_percent !== null && change_percent !== undefined && (
              <span
                className={`text-sm font-semibold cursor-help ${
                  change_percent > 0
                    ? 'text-green-600'
                    : change_percent < 0
                    ? 'text-red-600'
                    : 'text-gray-600'
                }`}
                title={`${change_percent > 0 ? 'Improved' : change_percent < 0 ? 'Declined' : 'No change'} by ${Math.abs(change_percent).toFixed(1)}% from previous week`}
              >
                {change_percent > 0 ? '+' : ''}
                {/* Cap display at ±100% for sanity */}
                {Math.max(-100, Math.min(100, change_percent)).toFixed(1)}%
              </span>
            )}
          </div>
        </div>
      )}

      {/* Chart */}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 5, right: 10, bottom: 5, left: 0 }}
          >
            <defs>
              <linearGradient id="moodGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.6} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
            />
            <YAxis
              domain={[minScore, maxScore]}
              hide
            />
            {showAverage && week_avg !== undefined && (
              <ReferenceLine
                y={week_avg}
                stroke="#6366f1"
                strokeDasharray="3 3"
                strokeOpacity={0.5}
              />
            )}
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: 'none',
                borderRadius: '12px',
                boxShadow: '0 10px 40px -5px rgba(0, 0, 0, 0.15)',
                padding: '10px 14px',
              }}
              labelStyle={{ fontWeight: 600, marginBottom: '4px', color: '#111827', fontSize: '12px' }}
              formatter={(value: number) => [
                <span className="font-semibold text-indigo-600">{value}/100</span>,
                <span className="text-gray-600">Mood Score</span>
              ]}
              labelFormatter={(label) => `${label}`}
              cursor={{ stroke: '#6366f1', strokeWidth: 1, strokeDasharray: '4 4' }}
            />
            <Area
              type="monotone"
              dataKey="avg_mood_score"
              stroke="#6366f1"
              strokeWidth={2}
              fill="url(#moodGradient)"
              dot={{ r: 3, fill: '#6366f1', strokeWidth: 0 }}
              activeDot={{ r: 5, fill: '#4f46e5', strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Week Average */}
      {showAverage && week_avg !== undefined && (
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span className="cursor-help" title="Average mood score for this week (0-100). Higher is better.">
            Week Average: <strong className="text-gray-700">{week_avg.toFixed(0)}/100</strong>
          </span>
          {moodTrends.prev_week_avg !== null && moodTrends.prev_week_avg !== undefined && (
            <span className="cursor-help" title="Average mood score from the previous week for comparison.">
              Previous: <strong className="text-gray-700">{moodTrends.prev_week_avg.toFixed(0)}/100</strong>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default MoodTimeline;
