import { AlertTriangle, CheckCircle, AlertCircle, XCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

interface RiskBadgeProps {
  level: RiskLevel;
  score?: number;
  reasoning?: string;
  showScore?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const riskConfig: Record<RiskLevel, {
  bg: string;
  text: string;
  border: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  animate?: boolean;
}> = {
  low: {
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-200',
    icon: CheckCircle,
    label: 'Low Risk',
  },
  medium: {
    bg: 'bg-yellow-50',
    text: 'text-yellow-700',
    border: 'border-yellow-200',
    icon: AlertCircle,
    label: 'Medium Risk',
  },
  high: {
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    border: 'border-orange-200',
    icon: AlertTriangle,
    label: 'High Risk',
  },
  critical: {
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
    icon: XCircle,
    label: 'Critical Risk',
    animate: true,
  },
};

const sizeClasses = {
  sm: 'px-2 py-0.5 text-xs gap-1',
  md: 'px-3 py-1 text-sm gap-1.5',
  lg: 'px-4 py-1.5 text-base gap-2',
};

const iconSizes = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

export function RiskBadge({
  level,
  score,
  reasoning,
  showScore = false,
  size = 'md',
}: RiskBadgeProps) {
  const config = riskConfig[level] || riskConfig.low;
  const Icon = config.icon;

  const badge = (
    <span
      className={`
        inline-flex items-center rounded-full font-semibold border
        ${config.bg} ${config.text} ${config.border}
        ${sizeClasses[size]}
        ${config.animate ? 'animate-pulse' : ''}
      `}
    >
      <Icon className={iconSizes[size]} />
      <span>{config.label}</span>
      {showScore && score !== undefined && (
        <span className="opacity-70">({score})</span>
      )}
    </span>
  );

  // If reasoning is provided, wrap in tooltip
  if (reasoning) {
    const reasons = reasoning.split(';').filter(Boolean);
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{badge}</TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <div className="text-sm">
              <p className="font-semibold mb-1">Risk Factors:</p>
              <ul className="list-disc list-inside space-y-0.5">
                {reasons.map((reason, i) => (
                  <li key={i} className="text-xs">
                    {reason.replace(/_/g, ' ').replace(/=/g, ': ')}
                  </li>
                ))}
              </ul>
              {score !== undefined && (
                <p className="mt-2 text-xs opacity-70">Score: {score}/25</p>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return badge;
}

export default RiskBadge;
