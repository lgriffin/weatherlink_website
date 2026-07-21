import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/downloads')({
  component: DownloadsPage,
});

function DownloadsPage() {
  return (
    <div className="stub-page">
      <h2>Downloads</h2>
      <p>Export weather data as CSV, JSON, PNG, SVG, or PDF.</p>
      <p>Coming in Phase 5.</p>
    </div>
  );
}
