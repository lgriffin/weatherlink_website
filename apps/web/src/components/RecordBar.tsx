import { formatValue, getUnitSymbol } from '../config/measurements';

interface RecordBarProps {
  label: string;
  high: number | null;
  low: number | null;
  current: number | null;
  unit: string;
  highDate: string;
  lowDate: string;
}

export function RecordBar({ label, high, low, current, unit, highDate, lowDate }: RecordBarProps) {
  if (high === null || low === null) return null;

  const range = high - low;
  const fillLeft = 0;
  const fillWidth = 100;

  let markerPosition: number | null = null;
  if (current !== null && range > 0) {
    markerPosition = Math.max(0, Math.min(100, ((current - low) / range) * 100));
  }

  const unitSymbol = getUnitSymbol(unit);

  return (
    <div className="record-bar">
      <div className="record-bar__header">
        <span className="record-bar__label">{label}</span>
        {current !== null && (
          <span className="record-bar__current">
            Now: {formatValue(current, unit)}{unitSymbol}
          </span>
        )}
      </div>
      <div className="record-bar__track">
        <div
          className="record-bar__fill"
          style={{ left: `${fillLeft}%`, width: `${fillWidth}%` }}
        />
        {markerPosition !== null && (
          <div
            className="record-bar__marker"
            style={{ left: `${markerPosition}%` }}
          />
        )}
      </div>
      <div className="record-bar__endpoints">
        <span className="record-bar__endpoint">
          <span className="record-bar__endpoint-value">
            {formatValue(low, unit)}{unitSymbol}
          </span>
          {' '}{lowDate}
        </span>
        <span className="record-bar__endpoint">
          {highDate}{' '}
          <span className="record-bar__endpoint-value">
            {formatValue(high, unit)}{unitSymbol}
          </span>
        </span>
      </div>
    </div>
  );
}
