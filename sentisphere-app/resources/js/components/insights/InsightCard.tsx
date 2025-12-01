import { TrendingUp, TrendingDown, AlertTriangle, Lightbulb } from 'lucide-react';
import { RiskBadge } from '@/components/ui/RiskBadge';
import { MoodTimeline } from './MoodTimeline';

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

interface Streaks {
  high_stress_consecutive_days: number;
  negative_mood_consecutive_days: number;
  feel_better_no_streak: number;
}

interface InsightMetadata {
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  risk_score: number;
  risk_reasoning?: string;
  week_avg?: number;
  journal_count: number;
  checkin_count: number;
  alerts_count: number;
  generated_at?: string;
}

interface InsightData {
  title: string;
  summary: string;
  mood_trends: MoodTrends;
  dominant_emotions?: string[];
  sentiment_breakdown?: {
    positive: number;
    neutral: number;
    negative: number;
  };
  stress_energy_patterns?: {
    stress: Record<string, number>;
    energy: Record<string, number>;
  };
  streaks?: Streaks;
  what_improved?: string[];
  what_declined?: string[];
  recommendations?: string[];
  metadata: InsightMetadata;
}

interface InsightCardProps {
  insight: InsightData;
  dateRange?: { start: string; end: string };
  compact?: boolean;
}

export function InsightCard({ insight, dateRange, compact = false }: InsightCardProps) {
  const {
    title,
    summary,
    mood_trends,
    dominant_emotions,
    streaks,
    what_improved,
    what_declined,
    recommendations,
    metadata,
  } = insight;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          {dateRange && (
            <p className="text-sm text-gray-500">
              {formatDate(dateRange.start)} – {formatDate(dateRange.end)}
            </p>
          )}
        </div>
        <RiskBadge
          level={metadata.risk_level}
          score={metadata.risk_score}
          reasoning={metadata.risk_reasoning}
          showScore={false}
        />
      </div>

      {/* Summary */}
      <p className="text-gray-700 text-sm leading-relaxed">{summary}</p>

      {/* Mood Timeline */}
      {mood_trends && mood_trends.daily && mood_trends.daily.length > 0 && (
        <div className="bg-gray-50 rounded-xl p-4">
          <MoodTimeline moodTrends={mood_trends} height={100} />
        </div>
      )}

      {/* Dominant Emotions */}
      {dominant_emotions && dominant_emotions.length > 0 && !compact && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Top Emotions
          </h4>
          <div className="flex flex-wrap gap-2">
            {dominant_emotions.slice(0, 5).map((emotion, i) => (
              <span
                key={i}
                className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium"
              >
                {emotion}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Streaks Warning */}
      {streaks && (streaks.high_stress_consecutive_days >= 3 ||
        streaks.negative_mood_consecutive_days >= 3 ||
        streaks.feel_better_no_streak >= 3) && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <div className="flex items-center gap-2 text-amber-700">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm font-medium">Pattern Alert</span>
          </div>
          <ul className="mt-1 text-xs text-amber-600 space-y-1">
            {streaks.high_stress_consecutive_days >= 3 && (
              <li>• {streaks.high_stress_consecutive_days} consecutive high-stress days</li>
            )}
            {streaks.negative_mood_consecutive_days >= 3 && (
              <li>• {streaks.negative_mood_consecutive_days} consecutive negative mood days</li>
            )}
            {streaks.feel_better_no_streak >= 3 && (
              <li>• {streaks.feel_better_no_streak} days without improvement</li>
            )}
          </ul>
        </div>
      )}

      {/* What Changed */}
      {!compact && ((what_improved && what_improved.length > 0) || (what_declined && what_declined.length > 0)) && (
        <div className="grid grid-cols-2 gap-3">
          {what_improved && what_improved.length > 0 && (
            <div className="bg-green-50 rounded-lg p-3">
              <div className="flex items-center gap-1 text-green-700 text-xs font-semibold mb-1">
                <TrendingUp className="h-3 w-3" />
                Improved
              </div>
              <ul className="text-xs text-green-800 space-y-0.5">
                {what_improved.map((item, i) => (
                  <li key={i}>{item.replace(/_/g, ' ')}</li>
                ))}
              </ul>
            </div>
          )}
          {what_declined && what_declined.length > 0 && (
            <div className="bg-red-50 rounded-lg p-3">
              <div className="flex items-center gap-1 text-red-700 text-xs font-semibold mb-1">
                <TrendingDown className="h-3 w-3" />
                Declined
              </div>
              <ul className="text-xs text-red-800 space-y-0.5">
                {what_declined.map((item, i) => (
                  <li key={i}>{item.replace(/_/g, ' ')}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Recommendations */}
      {recommendations && recommendations.length > 0 && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
          <div className="flex items-center gap-2 text-primary text-xs font-semibold uppercase tracking-wide mb-2">
            <Lightbulb className="h-4 w-4" />
            Recommendations
          </div>
          <ul className="text-sm text-gray-800 space-y-2">
            {recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Metadata Footer */}
      <div className="flex items-center justify-between pt-2 border-t text-xs text-gray-400">
        <div className="flex items-center gap-3">
          <span>{metadata.journal_count} journals</span>
          <span>{metadata.checkin_count} check-ins</span>
          {metadata.alerts_count > 0 && (
            <span className="text-amber-500">{metadata.alerts_count} alerts</span>
          )}
        </div>
        {metadata.generated_at && (
          <span>
            Generated {new Date(metadata.generated_at).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
}

export default InsightCard;
