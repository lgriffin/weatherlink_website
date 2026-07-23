import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { fetchHistory } from '../api/client';

export const Route = createFileRoute('/history')({
  component: HistoryPage,
});

const DISPLAY_LABELS: Record<string, string> = {
  'temperature.outdoor': 'Temperature',
  'humidity.outdoor': 'Humidity',
  'pressure.seaLevel': 'Pressure',
  'wind.gust': 'Wind Gust',
  'rain.daily': 'Daily Rain',
};

function getTodayMonthDay(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${m}-${d}`;
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
      <h2 style={{ marginBottom: '16px' }}>History</h2>

      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <label style={{ fontWeight: 500 }}>Date (MM-DD):</label>
        <input
          type="text"
          value={monthDay}
          onChange={(e) => {
            const v = e.target.value;
            if (/^\d{0,2}-?\d{0,2}$/.test(v)) setMonthDay(v);
          }}
          placeholder="MM-DD"
          style={{
            padding: '8px 12px',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius)',
            background: 'var(--color-surface)',
            color: 'var(--color-text)',
            fontSize: '0.875rem',
            width: '100px',
          }}
        />
      </div>

      {isPending && <div className="loading-container">Loading history...</div>}
      {isError && <div className="error-container">Failed to load history: {error.message}</div>}

      {data && Object.keys(data.measurements).length === 0 && (
        <div className="loading-container">No history data available for this date.</div>
      )}

      {data && Object.entries(data.measurements).map(([measurement, yearData]) => {
        const years = Object.keys(yearData).sort().reverse();
        if (years.length === 0) return null;

        return (
          <div key={measurement} className="measurement-card" style={{ marginBottom: '16px' }}>
            <div className="measurement-card__label">
              {DISPLAY_LABELS[measurement] ?? measurement}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 4px' }}>Year</th>
                  <th style={{ textAlign: 'right', padding: '8px 4px' }}>Min</th>
                  <th style={{ textAlign: 'right', padding: '8px 4px' }}>Max</th>
                  <th style={{ textAlign: 'right', padding: '8px 4px' }}>Avg</th>
                  <th style={{ textAlign: 'right', padding: '8px 4px' }}>Samples</th>
                </tr>
              </thead>
              <tbody>
                {years.map((year) => {
                  const s = yearData[year];
                  if (!s) return null;
                  return (
                    <tr key={year} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '8px 4px', fontWeight: 600 }}>{year}</td>
                      <td style={{ textAlign: 'right', padding: '8px 4px', fontVariantNumeric: 'tabular-nums' }}>
                        {s.min !== null ? s.min.toFixed(1) : '-'}
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px 4px', fontVariantNumeric: 'tabular-nums' }}>
                        {s.max !== null ? s.max.toFixed(1) : '-'}
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px 4px', fontVariantNumeric: 'tabular-nums' }}>
                        {s.avg !== null ? s.avg.toFixed(1) : '-'}
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px 4px', color: 'var(--color-text-muted)' }}>
                        {s.count}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
