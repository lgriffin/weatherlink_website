import { getLabel, getUnitSymbol, getColor, formatValue, formatTimestamp } from '../config/measurements';
import { Sparkline } from './Sparkline';

interface MeasurementCardProps {
  label: string;
  value: number | null;
  unit: string;
  timestamp: string | null;
  sparklineData?: Array<{ timestamp: number; value: number | null }> | undefined;
}

export function MeasurementCard({ label, value, unit, timestamp, sparklineData }: MeasurementCardProps) {
  const displayLabel = getLabel(label);
  const displayUnit = getUnitSymbol(unit);
  const color = getColor(label);

  return (
    <div className="measurement-card">
      <div className="measurement-card__label">{displayLabel}</div>
      <div className="measurement-card__value">
        {formatValue(value, unit)}
        {value !== null && displayUnit && (
          <span className="measurement-card__unit">{displayUnit}</span>
        )}
      </div>
      {sparklineData && sparklineData.length > 2 && (
        <div className="measurement-card__sparkline">
          <Sparkline data={sparklineData} color={color} />
        </div>
      )}
      {timestamp && (
        <div className="measurement-card__timestamp">{formatTimestamp(timestamp)}</div>
      )}
    </div>
  );
}
