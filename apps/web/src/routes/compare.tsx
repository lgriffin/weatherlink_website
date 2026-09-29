import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { MonthScoreResponse, WeatherRunResponse, YearComparisonResponse } from '@weather/contracts';
import { fetchYearComparison } from '../api/client';
import { SegmentedControl } from '../components/SegmentedControl';
import { ChartCard } from '../components/ChartCard';

export const Route = createFileRoute('/compare')({
  component: ComparePage,
});

const METRICS = [
  { key: 'rain.daily', label: 'Rain', unit: 'mm' },
  { key: 'degreeDays.heating', label: 'Heating degree days', unit: '°C·d' },
  { key: 'degreeDays.cooling', label: 'Cooling degree days', unit: '°C·d' },
  { key: 'evapotranspiration', label: 'Evapotranspiration', unit: 'mm' },
  { key: 'wind.run', label: 'Wind run', unit: 'km' },
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const RUN_LABELS: Record<WeatherRunResponse['kind'], { title: string; unit: string; empty: string }> = {
  dry: { title: 'Dry run', unit: 'dry days', empty: 'It rained on the latest day' },
  wet: { title: 'Wet run', unit: 'wet days', empty: 'The latest day was dry' },
  frost: { title: 'Frost run', unit: 'frosty nights', empty: 'No frost on the latest day' },
  warm: { title: '20 °C run', unit: 'days at 20 °C+', empty: 'The latest day stayed below 20 °C' },
};

const tooltipStyle = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius)',
};

function formatDate(date: string | null): string {
  if (!date) return '';
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatMonthDay(monthDay: string): string {
  return new Date(`2024-${monthDay}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function ComparePage() {
  const [metric, setMetric] = useState('rain.daily');
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['compare', metric, month],
    queryFn: () => fetchYearComparison(metric, month),
    staleTime: 5 * 60_000,
  });

  const metricInfo = METRICS.find((m) => m.key === metric)!;

  return (
    <div>
      <h2 className="page-title">Year vs Year</h2>

      {isPending && <div className="loading-container">Loading comparison...</div>}
      {isError && <div className="error-container">Failed to load comparison: {error.message}</div>}

      {data && data.runningTotals.length === 0 && (
        <div className="loading-container">No daily summaries yet. Run the archive harvest and rebuild first.</div>
      )}

      {data && data.runningTotals.length > 0 && (
        <>
          <p className="compare-asof">Complete days up to {formatDate(data.asOf)}. Outage days are left out of runs and month scores.</p>

          <div className="run-grid">
            {data.runs.map((run) => <RunCard key={run.kind} run={run} />)}
          </div>

          <div className="control-bar">
            <div className="control-group">
              <span className="control-group__label">Running total</span>
              <SegmentedControl
                options={METRICS.map((m) => ({ key: m.key, label: m.label }))}
                value={metric}
                onChange={setMetric}
              />
            </div>
          </div>

          <ChartCard title={`${metricInfo.label} through the year`} subtitle={metricInfo.unit}>
            <RunningTotalChart data={data} unit={metricInfo.unit} />
            <RunningTotalSummary data={data} unit={metricInfo.unit} />
          </ChartCard>

          <div className="control-bar" style={{ marginTop: 'var(--space-lg)' }}>
            <div className="control-group">
              <label className="control-group__label" htmlFor="compare-month">Month</label>
              <select
                id="compare-month"
                className="date-input compare-month"
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
              >
                {MONTHS.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
              </select>
            </div>
          </div>

          <ChartCard title={`${MONTHS[month - 1]} in each year`} subtitle="complete days only">
            <MonthTable scores={data.monthScores} />
          </ChartCard>
        </>
      )}
    </div>
  );
}

function RunCard({ run }: { run: WeatherRunResponse }) {
  const label = RUN_LABELS[run.kind];
  const isRecord = run.current > 0 && run.current >= run.longest;
  return (
    <div className="run-card">
      <div className="run-card__title">{label.title}</div>
      {run.current > 0 ? (
        <div className="run-card__value">
          {run.current}
          <span className="run-card__unit">{label.unit}</span>
        </div>
      ) : (
        <div className="run-card__empty">{label.empty}</div>
      )}
      {run.current > 0 && <div className="run-card__detail">since {formatDate(run.currentStart)}</div>}
      <div className={`run-card__detail${isRecord ? ' run-card__detail--record' : ''}`}>
        {isRecord ? 'Longest on record' : run.longest > 0 ? `Record ${run.longest}, to ${formatDate(run.longestEnd)}` : 'No record yet'}
      </div>
    </div>
  );
}

const YEAR_SHADES = ['var(--chart-rain)', 'var(--chart-temp)', 'var(--chart-wind)', 'var(--chart-humidity)', 'var(--chart-solar)'];

function RunningTotalChart({ data, unit }: { data: YearComparisonResponse; unit: string }) {
  const thisYear = data.asOf.substring(0, 4);
  const years = data.runningTotals.map((t) => t.year);
  // Only full calendar years form the comparison band; a first partial year starts from zero mid-year
  const previous = data.runningTotals.filter((t) => t.year !== thisYear && t.startDate.endsWith('-01-01'));

  const rows = useMemo(() => {
    const byDay = new Map<string, Record<string, number | [number, number] | string>>();
    for (const series of data.runningTotals) {
      for (const p of series.points) {
        const row = byDay.get(p.monthDay) ?? { monthDay: p.monthDay };
        row[series.year] = p.total;
        byDay.set(p.monthDay, row);
      }
    }
    // Range of the previous full years at each date
    for (const row of byDay.values()) {
      const values = previous.map((t) => row[t.year]).filter((v): v is number => typeof v === 'number');
      if (values.length >= 2) row['range'] = [Math.min(...values), Math.max(...values)];
    }
    return [...byDay.values()].sort((a, b) => String(a['monthDay']).localeCompare(String(b['monthDay'])));
  }, [data, previous]);

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis
          dataKey="monthDay"
          tickFormatter={(md: string) => new Date(`2024-${md}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short' })}
          ticks={['01-01', '02-01', '03-01', '04-01', '05-01', '06-01', '07-01', '08-01', '09-01', '10-01', '11-01', '12-01']}
          stroke="var(--color-text-muted)"
          fontSize={12}
        />
        <YAxis stroke="var(--color-text-muted)" fontSize={12} />
        <Tooltip
          contentStyle={tooltipStyle}
          labelFormatter={(md) => formatMonthDay(String(md))}
          formatter={(value, name) =>
            Array.isArray(value)
              ? [`${value[0]}–${value[1]} ${unit}`, 'Previous years']
              : [`${value} ${unit}`, name]}
        />
        <Legend />
        {previous.length >= 2 && (
          <Area dataKey="range" name="Previous years" stroke="none" fill="var(--color-text-muted)" fillOpacity={0.15} connectNulls />
        )}
        {years.map((year, i) => (
          <Line
            key={year}
            dataKey={year}
            name={year}
            stroke={year === thisYear ? 'var(--color-primary)' : (YEAR_SHADES[i % YEAR_SHADES.length] ?? 'var(--color-text-muted)')}
            strokeWidth={year === thisYear ? 3 : 1.5}
            strokeOpacity={year === thisYear ? 1 : 0.7}
            dot={false}
            connectNulls
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function RunningTotalSummary({ data, unit }: { data: YearComparisonResponse; unit: string }) {
  const thisYear = data.asOf.substring(0, 4);
  const today = data.asOf.substring(5);
  const rows = data.runningTotals.map((t) => {
    const toDate = [...t.points].reverse().find((p) => p.monthDay <= today)?.total ?? null;
    return { ...t, toDate };
  });

  return (
    <table className="card-table" style={{ marginTop: 'var(--space-sm)' }}>
      <thead>
        <tr>
          <th>Year</th>
          <th className="text-right">To {formatMonthDay(today)}</th>
          <th className="text-right">Whole year</th>
          <th className="text-right">Days missing</th>
        </tr>
      </thead>
      <tbody>
        {[...rows].reverse().map((r) => (
          <tr key={r.year}>
            <td className="text-bold">
              {r.year}
              {!r.startDate.endsWith('-01-01') && <span className="text-muted"> from {formatMonthDay(r.startDate.substring(5))}</span>}
            </td>
            <td className="text-right">{r.toDate !== null ? `${r.toDate} ${unit}` : '—'}</td>
            <td className="text-right">{r.year === thisYear ? 'so far' : `${r.final} ${unit}`}</td>
            <td className="text-right text-muted">{r.incompleteDays}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type ScoreKey = 'meanTemp' | 'maxTemp' | 'minTemp' | 'rainTotal' | 'wetDays' | 'frostDays' | 'peakGust';

const SCORE_COLUMNS: Array<{ key: ScoreKey; label: string; unit: string }> = [
  { key: 'meanTemp', label: 'Mean', unit: '°C' },
  { key: 'maxTemp', label: 'Highest', unit: '°C' },
  { key: 'minTemp', label: 'Lowest', unit: '°C' },
  { key: 'rainTotal', label: 'Rain', unit: 'mm' },
  { key: 'wetDays', label: 'Wet days', unit: '' },
  { key: 'frostDays', label: 'Frosts', unit: '' },
  { key: 'peakGust', label: 'Peak gust', unit: 'm/s' },
];

function MonthTable({ scores }: { scores: MonthScoreResponse[] }) {
  if (scores.length === 0) {
    return <div className="loading-container">No data for this month yet.</div>;
  }

  // Highest and lowest value in each column, marked when there are 2+ years to compare
  const extremes = Object.fromEntries(
    SCORE_COLUMNS.map(({ key }) => {
      const values = scores.map((s) => s[key]).filter((v): v is number => v !== null);
      return [key, values.length >= 2 ? { hi: Math.max(...values), lo: Math.min(...values) } : null];
    }),
  ) as Record<ScoreKey, { hi: number; lo: number } | null>;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="card-table">
        <thead>
          <tr>
            <th>Year</th>
            {SCORE_COLUMNS.map((c) => <th key={c.key} className="text-right">{c.label}</th>)}
            <th className="text-right">Complete days</th>
          </tr>
        </thead>
        <tbody>
          {[...scores].reverse().map((s) => (
            <tr key={s.year}>
              <td className="text-bold">{s.year}</td>
              {SCORE_COLUMNS.map((c) => {
                const v = s[c.key];
                const ext = extremes[c.key];
                const mark = ext && v !== null && ext.hi !== ext.lo ? (v === ext.hi ? 'score--high' : v === ext.lo ? 'score--low' : '') : '';
                return (
                  <td key={c.key} className={`text-right ${mark}`}>
                    {v === null ? '—' : `${v}${c.unit ? ` ${c.unit}` : ''}`}
                  </td>
                );
              })}
              <td className={`text-right ${s.completeDays < s.daysInMonth ? 'text-muted' : ''}`}>
                {s.completeDays}/{s.daysInMonth}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
