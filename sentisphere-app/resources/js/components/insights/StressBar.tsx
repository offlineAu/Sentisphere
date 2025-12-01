interface StressBarProps {
  patterns: {
    stress: Record<string, number>;
    energy: Record<string, number>;
  };
  showLabels?: boolean;
}

const stressLevelColors: Record<string, string> = {
  'No Stress': 'bg-green-400',
  'Low Stress': 'bg-green-300',
  'Moderate': 'bg-yellow-400',
  'High Stress': 'bg-orange-400',
  'Very High Stress': 'bg-red-500',
};

const energyLevelColors: Record<string, string> = {
  'Very Low': 'bg-gray-400',
  'Low': 'bg-gray-300',
  'Moderate': 'bg-blue-300',
  'High': 'bg-blue-400',
  'Very High': 'bg-blue-500',
};

export function StressBar({ patterns, showLabels = true }: StressBarProps) {
  const { stress, energy } = patterns;

  const stressTotal = Object.values(stress).reduce((a, b) => a + b, 0);
  const energyTotal = Object.values(energy).reduce((a, b) => a + b, 0);

  // Calculate high stress percentage
  const highStressCount =
    (stress['High Stress'] || 0) + (stress['Very High Stress'] || 0);
  const highStressPercent = stressTotal
    ? Math.round((highStressCount / stressTotal) * 100)
    : 0;

  // Calculate low energy percentage
  const lowEnergyCount = (energy['Low'] || 0) + (energy['Very Low'] || 0);
  const lowEnergyPercent = energyTotal
    ? Math.round((lowEnergyCount / energyTotal) * 100)
    : 0;

  const renderBar = (
    data: Record<string, number>,
    colors: Record<string, string>,
    total: number,
    label: string
  ) => {
    if (total === 0) {
      return (
        <div className="space-y-1">
          {showLabels && (
            <span className="text-xs text-gray-500">{label}</span>
          )}
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-gray-200 w-full flex items-center justify-center">
              <span className="text-[8px] text-gray-400">No data</span>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-1">
        {showLabels && (
          <span className="text-xs text-gray-500">{label}</span>
        )}
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex">
          {Object.entries(data)
            .filter(([_, count]) => count > 0)
            .map(([level, count], i) => {
              const percent = (count / total) * 100;
              return (
                <div
                  key={i}
                  className={`h-full ${colors[level] || 'bg-gray-300'}`}
                  style={{ width: `${percent}%` }}
                  title={`${level}: ${count} (${Math.round(percent)}%)`}
                />
              );
            })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Stress Bar */}
      <div>
        {renderBar(stress, stressLevelColors, stressTotal, 'Stress Distribution')}
        <div className="flex justify-between mt-1">
          <span className="text-xs text-gray-400">Low</span>
          <span
            className={`text-xs font-medium ${
              highStressPercent >= 50
                ? 'text-red-500'
                : highStressPercent >= 30
                ? 'text-orange-500'
                : 'text-green-500'
            }`}
          >
            {highStressPercent}% High Stress
          </span>
          <span className="text-xs text-gray-400">High</span>
        </div>
      </div>

      {/* Energy Bar */}
      <div>
        {renderBar(energy, energyLevelColors, energyTotal, 'Energy Distribution')}
        <div className="flex justify-between mt-1">
          <span className="text-xs text-gray-400">Low</span>
          <span
            className={`text-xs font-medium ${
              lowEnergyPercent >= 50
                ? 'text-gray-500'
                : lowEnergyPercent >= 30
                ? 'text-blue-400'
                : 'text-blue-500'
            }`}
          >
            {lowEnergyPercent}% Low Energy
          </span>
          <span className="text-xs text-gray-400">High</span>
        </div>
      </div>
    </div>
  );
}

export default StressBar;
