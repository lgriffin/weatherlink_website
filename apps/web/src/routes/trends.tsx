import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { fetchTimeSeries } from '../api/client';

export const Route = createFileRoute('/trends')({
  component: TrendsPage,
});

const METRIC_GROUPS = [
  {
    label: 'Temperature',
    metrics: [
      { key: 'temperature.outdoor', label: 'Outdoor', color: '#ef4444' },
      { key: 'temperature.dewPoint', label: 'Dew Point', color: '#3b82f6' },
      { key: 'temperature.heatIndex', label: 'Heat Index', color: '#f97316' },
      { key: 'temperature.windChill', label: 'Wind Chill', color: '#06b6d4' },
    ],
  },
  {
    label: 'Moisture',
    metrics: [
      { key: 'humidity.outdoor', label: 'Humidity', color: '#8b5cf6' },
      { key: 'rain.rate', label: 'Rain Rate', color: '#2563eb' },
      { key: 'rain.daily', label: 'Daily Rain', color: '#0891b2' },
    ],
  },
  {
    label: 'Wind',
    metrics: [
      { key: 'wind.speed', label: 'Speed', color: '#22c55e' },
      { key: 'wind.gust', label: 'Gust', color: '#f59e0b' },
    ],
  },
  {
    label: 'Pressure & Solar',
    metrics: [
      { key: 'pressure.seaLevel', label: 'Pressure', color: '#a855f7' },
      { key: 'solar.radiation', label: 'Solar', color: '#eab308' },
      { key: 'uv.index', label: 'UV Index', color: '#f43f5e' },
    ],
  },
];

const RESOLUTIONS = [
  { key: 'raw', label: 'Raw' },
  { key: 'hourly', label: 'Hourly' },
  { key: 'daily', label: 'Daily' },
] as const;

const PRESETS = [
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
  { label: '30d', hours: 720 },
] as const;

function TrendsPage() {
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(['temperature.outdoor']);
  const [resolution, setResolution] = useState('hourly');
  const [hoursBack, setHoursBack] = useState(24);

  const { from, to } = useMemo(() => {
    const now = new Date();
    return {
      from: new Date(now.getTime() - hoursBack * 3600000).toISOString(),
      to: now.toISOString(),
    };
  }, [hoursBack]);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['series', selectedMetrics, from, to, resolution],
    queryFn: () => fetchTimeSeries(selectedMetrics, from, to, resolution),
    staleTime: 30_000,
    enabled: selectedMetrics.length > 0,
  });

  const chartData = useMemo(() => {
    if (!data?.series.length) return [];
    const byTimestamp = new Map<number, Record<string, number | null>>();

    for (const s of data.series) {
      for (const p of s.points) {
        let entry = byTimestamp.get(p.timestamp);
        if (!entry) {
          entry = {};
          byTimestamp.set(p.timestamp, entry);
        }
        entry[s.metric] = p.value;
      }
    }

    return Array.from(byTimestamp.entries())
      .map(([ts, values]) => ({ timestamp: ts, ...values }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [data]);

  const allMetrics = METRIC_GROUPS.flatMap((g) => g.metrics);

  function toggleMetric(key: string) {
    setSelectedMetrics((prev) =>
      prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key],
    );
  }

  return (
    <div>
      <h2 style={{ marginBottom: '16px' }}>Trends</h2>

      <div style={{ display: 'flex', gap: '24px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '8px' }}>
            Range
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => setHoursBack(p.hours)}
                style={{
                  padding: '6px 12px',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius)',
                  background: hoursBack === p.hours ? 'var(--color-primary)' : 'var(--color-surface)',
                  color: hoursBack === p.hours ? '#fff' : 'var(--color-text)',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '8px' }}>
            Resolution
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            {RESOLUTIONS.map((r) => (
              <button
                key={r.key}
                onClick={() => setResolution(r.key)}
                style={{
                  padding: '6px 12px',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius)',
                  background: resolution === r.key ? 'var(--color-primary)' : 'var(--color-surface)',
                  color: resolution === r.key ? '#fff' : 'var(--color-text)',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {METRIC_GROUPS.map((group) => (
          <div key={group.label}>
            <div style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
              {group.label}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {group.metrics.map((m) => (
                <label key={m.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selectedMetrics.includes(m.key)}
                    onChange={() => toggleMetric(m.key)}
                  />
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: m.color, display: 'inline-block' }} />
                  {m.label}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {isPending && <div className="loading-container">Loading chart data...</div>}
      {isError && <div className="error-container">Failed to load data: {error.message}</div>}

      {chartData.length > 0 && (
        <div className="measurement-card" style={{ padding: '16px' }}>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis
                dataKey="timestamp"
                tickFormatter={(ts: number) => {
                  const d = new Date(ts);
                  return hoursBack <= 48
                    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
                }}
                stroke="var(--color-text-muted)"
                fontSize={12}
              />
              <YAxis stroke="var(--color-text-muted)" fontSize={12} />
              <Tooltip
                labelFormatter={(ts) => new Date(Number(ts)).toLocaleString()}
                contentStyle={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius)',
                }}
              />
              <Legend />
              {selectedMetrics.map((metric) => {
                const meta = allMetrics.find((m) => m.key === metric);
                return (
                  <Line
                    key={metric}
                    type="monotone"
                    dataKey={metric}
                    name={meta?.label ?? metric}
                    stroke={meta?.color ?? '#888'}
                    dot={false}
                    strokeWidth={2}
                    connectNulls
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {data && chartData.length === 0 && selectedMetrics.length > 0 && (
        <div className="loading-container">No data points for the selected range and metrics.</div>
      )}
    </div>
  );
}
