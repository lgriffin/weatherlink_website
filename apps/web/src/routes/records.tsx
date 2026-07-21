import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/records')({
  component: RecordsPage,
});

function RecordsPage() {
  return (
    <div className="stub-page">
      <h2>Records</h2>
      <p>Daily, monthly, yearly, and all-time records will be displayed here.</p>
      <p>Coming in Phase 3.</p>
    </div>
  );
}
