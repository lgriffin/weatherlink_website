import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/trends')({
  component: TrendsPage,
});

function TrendsPage() {
  return (
    <div className="stub-page">
      <h2>Trends</h2>
      <p>Interactive charts for temperature, rainfall, wind, pressure, and more.</p>
      <p>Coming in Phase 4.</p>
    </div>
  );
}
