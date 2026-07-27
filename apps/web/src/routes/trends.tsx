import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  AreaChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { fetchTimeSeries } from '../api/client';
import { SegmentedControl } from '../components/SegmentedControl';
import { ChartCard } from '../components/ChartCard';
import { CHART_GROUPS, getColor } from '../config/measurements';

export const Route = createFileRoute('/trends')({
  component: TrendsPage,
});

const PRESETS = [
  { key: '24', label: '24h', hours: 24 },
  { key: '168', label: '7d', hours: 168 },
  { key: '720', label: '30d', hours: 720 },
];

const RESOLUTIONS = [
  { key: 'raw', label: 'Raw' },
  { key: 'hourly', label: 'Hourly' },
  { key: 'daily', label: 'Daily' },
];

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

  const seriesByMetric = useMemo(() => {
    const map = new Map<string, Array<{ timestamp: number; value: number | null }>>();
    if (!data?.series) return map;
    for (const s of data.series) {
      map.set(s.metric, s.points);
    }
    return map;
  }, [data]);

  function toggleMetric(key: string) {
    setSelectedMetrics((prev) =>
      prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key],
    );
  }

  const activeGroups = CHART_GROUPS.filter((g) =>
    g.metrics.some((m) => selectedMetrics.includes(m.key)),
  );

  return (
    <div>
      <h2 className="page-title">Trends</h2>

      <div className="control-bar">
        <div className="control-group">
          <span className="control-group__label">Range</span>
          <SegmentedControl
            options={PRESETS}
            value={String(hoursBack)}
            onChange={(k) => setHoursBack(Number(k))}
          />
        </div>
        <div className="control-group">
          <span className="control-group__label">Resolution</span>
          <SegmentedControl
            options={RESOLUTIONS}
            value={resolution}
            onChange={setResolution}
          />
        </div>
      </div>

      <div className="metric-chips">
        {CHART_GROUPS.map((group) => (
          <div key={group.key} className="metric-chips__group">
            <div className="metric-chips__group-label">{group.label}</div>
            {group.metrics.map((m) => (
              <label key={m.key} className="metric-chip">
                <input
                  type="checkbox"
                  checked={selectedMetrics.includes(m.key)}
                  onChange={() => toggleMetric(m.key)}
                />
                <span className="metric-chip__dot" style={{ background: getColor(m.key) }} />
                {m.label}
              </label>
            ))}
          </div>
        ))}
      </div>

      {isPending && <div className="loading-container">Loading chart data...</div>}
      {isError && <div className="error-container">Failed to load data: {error.message}</div>}

      {activeGroups.length > 0 && (
        <div className="chart-grid">
          {activeGroups.map((group) => {
            const groupMetrics = group.metrics.filter((m) => selectedMetrics.includes(m.key));
            const chartData = buildChartData(groupMetrics.map((m) => m.key), seriesByMetric);

            if (chartData.length === 0) return null;

            return (
              <ChartCard key={group.key} title={group.label} subtitle={group.unit || undefined}>
                <ResponsiveContainer width="100%" height={300}>
                  {group.useArea ? (
                    <AreaChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis
                        dataKey="timestamp"
                        tickFormatter={(ts: number) => formatTick(ts, hoursBack)}
                        stroke="var(--color-text-muted)"
                        fontSize={12}
                      />
                      <YAxis stroke="var(--color-text-muted)" fontSize={12} />
                      <Tooltip
                        labelFormatter={(ts) => new Date(Number(ts)).toLocaleString()}
                        contentStyle={tooltipStyle}
                      />
                      <Legend />
                      {groupMetrics.map((m) => (
                        <Area
                          key={m.key}
                          type="monotone"
                          dataKey={m.key}
                          name={m.label}
                          stroke={getColor(m.key)}
                          fill={getColor(m.key)}
                          fillOpacity={0.15}
                          strokeWidth={2}
                          dot={false}
                          connectNulls
                        />
                      ))}
                    </AreaChart>
                  ) : (
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis
                        dataKey="timestamp"
                        tickFormatter={(ts: number) => formatTick(ts, hoursBack)}
                        stroke="var(--color-text-muted)"
                        fontSize={12}
                      />
                      <YAxis stroke="var(--color-text-muted)" fontSize={12} />
                      <Tooltip
                        labelFormatter={(ts) => new Date(Number(ts)).toLocaleString()}
                        contentStyle={tooltipStyle}
                      />
                      <Legend />
                      {groupMetrics.map((m) => (
                        <Line
                          key={m.key}
                          type="monotone"
                          dataKey={m.key}
                          name={m.label}
                          stroke={getColor(m.key)}
                          dot={false}
                          strokeWidth={2}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </ChartCard>
            );
          })}
        </div>
      )}

      {data && activeGroups.length === 0 && selectedMetrics.length > 0 && (
        <div className="loading-container">No data points for the selected range and metrics.</div>
      )}
    </div>
  );
}

const tooltipStyle = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius)',
};

function formatTick(ts: number, hoursBack: number): string {
  const d = new Date(ts);
  return hoursBack <= 48
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function buildChartData(
  keys: string[],
  seriesByMetric: Map<string, Array<{ timestamp: number; value: number | null }>>,
): Array<Record<string, number | null>> {
  const byTimestamp = new Map<number, Record<string, number | null>>();

  for (const key of keys) {
    const points = seriesByMetric.get(key);
    if (!points) continue;
    for (const p of points) {
      let entry = byTimestamp.get(p.timestamp);
      if (!entry) {
        entry = { timestamp: p.timestamp };
        byTimestamp.set(p.timestamp, entry);
      }
      entry[key] = p.value;
    }
  }

  return Array.from(byTimestamp.values()).sort(
    (a, b) => (a.timestamp as number) - (b.timestamp as number),
  );
}
