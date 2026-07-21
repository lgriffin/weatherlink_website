interface MeasurementCardProps {
  label: string;
  value: number | null;
  unit: string;
  timestamp: string | null;
}

const DISPLAY_LABELS: Record<string, string> = {
  'temperature.outdoor': 'Temperature',
  'temperature.indoor': 'Indoor Temp',
  'temperature.apparent': 'Feels Like',
  'temperature.dewPoint': 'Dew Point',
  'temperature.heatIndex': 'Heat Index',
  'temperature.windChill': 'Wind Chill',
  'humidity.outdoor': 'Humidity',
  'humidity.indoor': 'Indoor Humidity',
  'pressure.seaLevel': 'Pressure',
  'pressure.absolute': 'Abs. Pressure',
  'wind.speed': 'Wind Speed',
  'wind.gust': 'Wind Gust',
  'wind.direction': 'Wind Direction',
  'wind.speedAvg10Min': 'Wind (10m avg)',
  'rain.rate': 'Rain Rate',
  'rain.daily': 'Rain Today',
  'rain.monthly': 'Rain This Month',
  'rain.yearly': 'Rain This Year',
  'solar.radiation': 'Solar Radiation',
  'uv.index': 'UV Index',
};

const UNIT_DISPLAY: Record<string, string> = {
  celsius: '°C',
  hPa: 'hPa',
  'm/s': 'm/s',
  mm: 'mm',
  'mm/h': 'mm/h',
  'W/m2': 'W/m²',
  degrees: '°',
  percent: '%',
  uv_index: '',
};

function formatValue(value: number | null, unit: string): string {
  if (value === null) return '—';
  if (unit === 'degrees') return `${Math.round(value)}`;
  if (unit === 'percent') return `${Math.round(value)}`;
  if (unit === 'uv_index') return `${value.toFixed(1)}`;
  return value.toFixed(1);
}

function formatTimestamp(ts: string | null): string {
  if (!ts) return '';
  const date = new Date(ts);
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function MeasurementCard({ label, value, unit, timestamp }: MeasurementCardProps) {
  const displayLabel = DISPLAY_LABELS[label] ?? label;
  const displayUnit = UNIT_DISPLAY[unit] ?? unit;

  return (
    <div className="measurement-card">
      <div className="measurement-card__label">{displayLabel}</div>
      <div className="measurement-card__value">
        {formatValue(value, unit)}
        {value !== null && displayUnit && (
          <span className="measurement-card__unit">{displayUnit}</span>
        )}
      </div>
      {timestamp && (
        <div className="measurement-card__timestamp">{formatTimestamp(timestamp)}</div>
      )}
    </div>
  );
}

export { DISPLAY_LABELS };
