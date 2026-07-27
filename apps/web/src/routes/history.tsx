import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { fetchHistory } from '../api/client';
import { ChartCard } from '../components/ChartCard';
import { YearComparisonChart } from '../components/YearComparisonChart';
import { getLabel, getUnitSymbol } from '../config/measurements';

export const Route = createFileRoute('/history')({
  component: HistoryPage,
});

function getTodayMonthDay(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${m}-${d}`;
}

function adjustDate(monthDay: string, delta: number): string {
  const [mm, dd] = monthDay.split('-').map(Number);
  if (!mm || !dd) return monthDay;
  const d = new Date(2024, mm - 1, dd + delta);
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatMonthDay(monthDay: string): string {
  const [mm, dd] = monthDay.split('-').map(Number);
  if (!mm || !dd) return monthDay;
  const d = new Date(2024, mm - 1, dd);
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
}

function HistoryPage() {
  const [monthDay, setMonthDay] = useState(getTodayMonthDay);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['history', monthDay],
    queryFn: () => fetchHistory(monthDay),
    staleTime: 60_000,
  });

  return (
    <div>
      <h2 className="page-title">History</h2>

      <div className="date-controls">
        <button className="date-button" onClick={() => setMonthDay((d) => adjustDate(d, -1))}>
          &larr;
        </button>
        <input
          className="date-input"
          type="text"
          value={monthDay}
          onChange={(e) => {
            const v = e.target.value;
            if (/^\d{0,2}-?\d{0,2}$/.test(v)) setMonthDay(v);
          }}
          placeholder="MM-DD"
        />
        <button className="date-button" onClick={() => setMonthDay((d) => adjustDate(d, 1))}>
          &rarr;
        </button>
        <button
          className="date-button"
          onClick={() => setMonthDay(getTodayMonthDay())}
        >
          Today
        </button>
        <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
          {formatMonthDay(monthDay)}
        </span>
      </div>

      {isPending && <div className="loading-container">Loading history...</div>}
      {isError && <div className="error-container">Failed to load history: {error.message}</div>}

      {data && Object.keys(data.measurements).length === 0 && (
        <div className="loading-container">No history data available for this date.</div>
      )}

      {data && Object.keys(data.measurements).length > 0 && (
        <div className="chart-grid">
          {Object.entries(data.measurements).map(([measurement, yearData]) => {
            const years = Object.keys(yearData);
            if (years.length === 0) return null;

            const sampleYear = yearData[years[0]!];
            const unit = inferUnit(measurement);

            return (
              <ChartCard
                key={measurement}
                title={getLabel(measurement)}
                subtitle={getUnitSymbol(unit) || undefined}
              >
                <YearComparisonChart
                  metric={measurement}
                  yearData={yearData}
                  unit={unit}
                />
                <HistoryTable yearData={yearData} />
              </ChartCard>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HistoryTable({ yearData }: { yearData: Record<string, { min: number | null; max: number | null; avg: number | null; count: number }> }) {
  const years = Object.keys(yearData).sort().reverse();
  return (
    <details style={{ marginTop: 'var(--space-sm)' }}>
      <summary style={{ cursor: 'pointer', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
        Show table
      </summary>
      <table className="card-table" style={{ marginTop: 'var(--space-xs)' }}>
        <thead>
          <tr>
            <th>Year</th>
            <th className="text-right">Min</th>
            <th className="text-right">Max</th>
            <th className="text-right">Avg</th>
            <th className="text-right">Samples</th>
          </tr>
        </thead>
        <tbody>
          {years.map((year) => {
            const s = yearData[year]!;
            return (
              <tr key={year}>
                <td className="text-bold">{year}</td>
                <td className="text-right">{s.min !== null ? s.min.toFixed(1) : '—'}</td>
                <td className="text-right">{s.max !== null ? s.max.toFixed(1) : '—'}</td>
                <td className="text-right">{s.avg !== null ? s.avg.toFixed(1) : '—'}</td>
                <td className="text-right text-muted">{s.count}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </details>
  );
}

function inferUnit(measurement: string): string {
  const unitMap: Record<string, string> = {
    'temperature.outdoor': 'celsius',
    'humidity.outdoor': 'percent',
    'pressure.seaLevel': 'hPa',
    'wind.gust': 'm/s',
    'rain.daily': 'mm',
  };
  return unitMap[measurement] ?? '';
}
