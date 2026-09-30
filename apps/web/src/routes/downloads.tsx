import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { SegmentedControl } from '../components/SegmentedControl';
import { getLabel } from '../config/measurements';
import { IS_STATIC } from '../config/site';

export const Route = createFileRoute('/downloads')({
  component: DownloadsPage,
});

const FORMATS = [
  { key: 'csv', label: 'CSV', description: 'Tabular data for spreadsheets' },
  { key: 'json', label: 'JSON', description: 'Structured data for APIs' },
  { key: 'svg', label: 'SVG', description: 'Vector chart image' },
];

const METRIC_OPTIONS = [
  'temperature.outdoor',
  'humidity.outdoor',
  'pressure.seaLevel',
  'wind.speed',
  'wind.gust',
  'rain.daily',
  'rain.rate',
  'solar.radiation',
  'uv.index',
];

const PRESETS = [
  { key: '24', label: 'Last 24h', hours: 24 },
  { key: '168', label: 'Last 7 days', hours: 168 },
  { key: '720', label: 'Last 30 days', hours: 720 },
];

function DownloadsPage() {
  if (IS_STATIC) return <StaticDownloadsNotice />;
  return <DownloadForm />;
}

function StaticDownloadsNotice() {
  return (
    <div>
      <h2 className="page-title">Downloads</h2>
      <div className="measurement-card">
        <p>Downloads are made by the station server, so they aren't available on this published snapshot.</p>
        <p>Run the site locally (<code>pnpm dev</code>) to export CSV, JSON or SVG.</p>
      </div>
    </div>
  );
}

function DownloadForm() {
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
      <h2 className="page-title">Downloads</h2>

      <div className="measurement-card download-form">
        <div className="download-form__section">
          <div className="measurement-card__label">Format</div>
          <SegmentedControl options={FORMATS} value={format} onChange={setFormat} />
        </div>

        <div className="download-form__section">
          <div className="measurement-card__label">Time Range</div>
          <SegmentedControl
            options={PRESETS}
            value={String(hoursBack)}
            onChange={(k) => setHoursBack(Number(k))}
          />
        </div>

        <div className="download-form__section">
          <div className="measurement-card__label">Metrics</div>
          <div className="download-form__metrics">
            {METRIC_OPTIONS.map((key) => (
              <label key={key} className="metric-chip">
                <input
                  type="checkbox"
                  checked={selectedMetrics.includes(key)}
                  onChange={() => toggleMetric(key)}
                />
                {getLabel(key)}
              </label>
            ))}
          </div>
        </div>

        <button
          className="download-button"
          onClick={handleExport}
          disabled={isDownloading || selectedMetrics.length === 0}
        >
          {isDownloading ? 'Downloading...' : `Download ${format.toUpperCase()}`}
        </button>
      </div>
    </div>
  );
}
