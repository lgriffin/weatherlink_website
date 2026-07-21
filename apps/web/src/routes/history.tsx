import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/history')({
  component: HistoryPage,
});

function HistoryPage() {
  return (
    <div className="stub-page">
      <h2>History</h2>
      <p>Compare the same calendar date across all available years.</p>
      <p>Coming in Phase 3.</p>
    </div>
  );
}
