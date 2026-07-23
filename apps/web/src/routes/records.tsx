import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { fetchRecords } from '../api/client';
import type { RecordResponse } from '@weather/contracts';

export const Route = createFileRoute('/records')({
  component: RecordsPage,
});

const SCOPES = [
  { key: 'all-time', label: 'All-Time' },
  { key: 'yearly', label: 'Yearly' },
  { key: 'monthly', label: 'Monthly' },
] as const;

const DISPLAY_LABELS: Record<string, string> = {
  'temperature.outdoor': 'Temperature',
  'temperature.dewPoint': 'Dew Point',
  'temperature.heatIndex': 'Heat Index',
  'temperature.windChill': 'Wind Chill',
  'humidity.outdoor': 'Humidity',
  'pressure.seaLevel': 'Pressure',
  'wind.speed': 'Wind Speed',
  'wind.gust': 'Wind Gust',
  'rain.daily': 'Daily Rain',
  'rain.rate': 'Rain Rate',
  'solar.radiation': 'Solar Radiation',
  'uv.index': 'UV Index',
};

function RecordsPage() {
  const [scope, setScope] = useState<string>('all-time');

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['records', scope],
    queryFn: () => fetchRecords(scope),
    staleTime: 60_000,
  });

  const grouped = groupRecordsByMeasurement(data?.records ?? []);

  return (
    <div>
      <h2 style={{ marginBottom: '16px' }}>Records</h2>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        {SCOPES.map((s) => (
          <button
            key={s.key}
            onClick={() => setScope(s.key)}
            style={{
              padding: '8px 16px',
              border: `1px solid var(--color-border)`,
              borderRadius: 'var(--radius)',
              background: scope === s.key ? 'var(--color-primary)' : 'var(--color-surface)',
              color: scope === s.key ? '#fff' : 'var(--color-text)',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {isPending && <div className="loading-container">Loading records...</div>}
      {isError && <div className="error-container">Failed to load records: {error.message}</div>}

      {data && grouped.length === 0 && (
        <div className="loading-container">No records available yet. Data will appear after observations are collected and processed.</div>
      )}

      {grouped.map(([measurement, records]) => (
        <div key={measurement} className="measurement-card" style={{ marginBottom: '16px' }}>
          <div className="measurement-card__label">
            {DISPLAY_LABELS[measurement] ?? measurement}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                {scope !== 'all-time' && <th style={{ textAlign: 'left', padding: '8px 4px' }}>Period</th>}
                <th style={{ textAlign: 'left', padding: '8px 4px' }}>Type</th>
                <th style={{ textAlign: 'right', padding: '8px 4px' }}>Value</th>
                <th style={{ textAlign: 'right', padding: '8px 4px' }}>Date</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  {scope !== 'all-time' && <td style={{ padding: '8px 4px' }}>{r.scopeKey}</td>}
                  <td style={{ padding: '8px 4px', textTransform: 'capitalize' }}>{r.recordType}</td>
                  <td style={{ textAlign: 'right', padding: '8px 4px', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    {r.value.toFixed(1)} <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>{r.unit}</span>
                  </td>
                  <td style={{ textAlign: 'right', padding: '8px 4px', color: 'var(--color-text-muted)' }}>{r.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function groupRecordsByMeasurement(records: RecordResponse[]): [string, RecordResponse[]][] {
  const map = new Map<string, RecordResponse[]>();
  for (const r of records) {
    let list = map.get(r.measurementName);
    if (!list) {
      list = [];
      map.set(r.measurementName, list);
    }
    list.push(r);
  }
  return Array.from(map.entries());
}
