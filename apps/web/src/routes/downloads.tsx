import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

export const Route = createFileRoute('/downloads')({
  component: DownloadsPage,
});

const FORMATS = [
  { key: 'csv', label: 'CSV', description: 'Tabular data for spreadsheets' },
  { key: 'json', label: 'JSON', description: 'Structured data for APIs' },
  { key: 'svg', label: 'SVG', description: 'Vector chart image' },
] as const;

const METRIC_OPTIONS = [
  { key: 'temperature.outdoor', label: 'Temperature' },
  { key: 'humidity.outdoor', label: 'Humidity' },
  { key: 'pressure.seaLevel', label: 'Pressure' },
  { key: 'wind.speed', label: 'Wind Speed' },
  { key: 'wind.gust', label: 'Wind Gust' },
  { key: 'rain.daily', label: 'Daily Rain' },
  { key: 'rain.rate', label: 'Rain Rate' },
  { key: 'solar.radiation', label: 'Solar Radiation' },
  { key: 'uv.index', label: 'UV Index' },
];

const PRESETS = [
  { label: 'Last 24h', hours: 24 },
  { label: 'Last 7 days', hours: 168 },
  { label: 'Last 30 days', hours: 720 },
] as const;

function DownloadsPage() {
  const [format, setFormat] = useState('csv');
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(['temperature.outdoor']);
  const [hoursBack, setHoursBack] = useState(24);
  const [isDownloading, setIsDownloading] = useState(false);

  function toggleMetric(key: string) {
    setSelectedMetrics((prev) =>
      prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key],
    );
  }

  async function handleExport() {
    if (selectedMetrics.length === 0) return;
    setIsDownloading(true);

    try {
      const now = new Date();
      const from = new Date(now.getTime() - hoursBack * 3600000);
      const params = new URLSearchParams({
        format,
        metrics: selectedMetrics.join(','),
        from: from.toISOString(),
        to: now.toISOString(),
      });

      const res = await fetch(`/api/v1/export?${params}`);
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);

      const disposition = res.headers.get('Content-Disposition');
      const filename = disposition?.match(/filename="(.+)"/)?.[1] ?? `export.${format}`;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: '16px' }}>Downloads</h2>

      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        <div className="measurement-card" style={{ flex: '1', minWidth: '300px' }}>
          <div className="measurement-card__label">Format</div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
            {FORMATS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFormat(f.key)}
                style={{
                  padding: '10px 16px',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius)',
                  background: format === f.key ? 'var(--color-primary)' : 'var(--color-surface)',
                  color: format === f.key ? '#fff' : 'var(--color-text)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div style={{ fontWeight: 600 }}>{f.label}</div>
                <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>{f.description}</div>
              </button>
            ))}
          </div>

          <div className="measurement-card__label">Time Range</div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => setHoursBack(p.hours)}
                style={{
                  padding: '8px 16px',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius)',
                  background: hoursBack === p.hours ? 'var(--color-primary)' : 'var(--color-surface)',
                  color: hoursBack === p.hours ? '#fff' : 'var(--color-text)',
                  cursor: 'pointer',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="measurement-card__label">Metrics</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '20px' }}>
            {METRIC_OPTIONS.map((m) => (
              <label key={m.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={selectedMetrics.includes(m.key)}
                  onChange={() => toggleMetric(m.key)}
                />
                {m.label}
              </label>
            ))}
          </div>

          <button
            onClick={handleExport}
            disabled={isDownloading || selectedMetrics.length === 0}
            style={{
              padding: '12px 24px',
              background: 'var(--color-primary)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius)',
              cursor: isDownloading || selectedMetrics.length === 0 ? 'not-allowed' : 'pointer',
              opacity: isDownloading || selectedMetrics.length === 0 ? 0.5 : 1,
              fontWeight: 600,
              fontSize: '0.875rem',
              width: '100%',
            }}
          >
            {isDownloading ? 'Downloading...' : `Download ${format.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}
