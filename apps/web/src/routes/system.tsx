import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { fetchHealth } from '../api/client';

export const Route = createFileRoute('/system')({
  component: SystemPage,
});

function SystemPage() {
  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 10_000,
  });

  return (
    <div>
      <h2 style={{ marginBottom: '24px' }}>System Status</h2>

      {healthQuery.isPending && (
        <div className="loading-container">Loading system status...</div>
      )}

      {healthQuery.isError && (
        <div className="error-container">
          Failed to load system status: {healthQuery.error.message}
        </div>
      )}

      {healthQuery.data && (
        <div className="dashboard-grid">
          <div className="measurement-card">
            <div className="measurement-card__label">Overall Status</div>
            <div className="measurement-card__value">{healthQuery.data.status}</div>
          </div>

          <div className="measurement-card">
            <div className="measurement-card__label">Uptime</div>
            <div className="measurement-card__value">
              {formatUptime(healthQuery.data.uptime)}
            </div>
          </div>

          {healthQuery.data.components.map((c) => (
            <div key={c.name} className="measurement-card">
              <div className="measurement-card__label">{c.name}</div>
              <div className="measurement-card__value">{c.status}</div>
              {c.latencyMs !== null && (
                <div className="measurement-card__timestamp">{c.latencyMs}ms</div>
              )}
              {c.message && (
                <div className="measurement-card__timestamp">{c.message}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
