import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { fetchCurrentConditions, fetchStation } from '../api/client';
import { FreshnessBadge } from '../components/FreshnessBadge';
import { MeasurementCard, DISPLAY_LABELS } from '../components/MeasurementCard';

export const Route = createFileRoute('/')({
  component: NowDashboard,
});

const MEASUREMENT_ORDER = [
  'temperature.outdoor',
  'temperature.apparent',
  'humidity.outdoor',
  'pressure.seaLevel',
  'wind.speed',
  'wind.gust',
  'wind.direction',
  'rain.daily',
  'rain.rate',
  'temperature.dewPoint',
  'temperature.heatIndex',
  'temperature.windChill',
  'solar.radiation',
  'uv.index',
  'temperature.indoor',
  'humidity.indoor',
  'pressure.absolute',
  'wind.speedAvg10Min',
  'rain.monthly',
  'rain.yearly',
];

function NowDashboard() {
  const stationQuery = useQuery({
    queryKey: ['station'],
    queryFn: fetchStation,
    staleTime: 60_000,
  });

  const currentQuery = useQuery({
    queryKey: ['current'],
    queryFn: fetchCurrentConditions,
    refetchInterval: 30_000,
  });

  if (stationQuery.isPending || currentQuery.isPending) {
    return <div className="loading-container">Loading current conditions...</div>;
  }

  if (currentQuery.isError) {
    return (
      <div className="error-container">
        Failed to load current conditions: {currentQuery.error.message}
      </div>
    );
  }

  const current = currentQuery.data;
  const station = stationQuery.data;

  const sortedMeasurements = MEASUREMENT_ORDER.filter(
    (key) => current.measurements[key] !== undefined,
  ).map((key) => ({ key, ...current.measurements[key]! }));

  const remainingMeasurements = Object.entries(current.measurements)
    .filter(([key]) => !MEASUREMENT_ORDER.includes(key))
    .map(([key, m]) => ({ key, ...m }));

  const allMeasurements = [...sortedMeasurements, ...remainingMeasurements];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
        <h2>{station?.stations.find((s) => s.isActive)?.name ?? current.stationName}</h2>
        <FreshnessBadge state={current.freshness.state} ageSeconds={current.freshness.ageSeconds} />
      </div>

      <div className="dashboard-grid">
        {allMeasurements.map((m) => (
          <MeasurementCard
            key={m.key}
            label={m.key}
            value={m.value}
            unit={m.unit}
            timestamp={m.timestamp}
          />
        ))}
      </div>

      {allMeasurements.length === 0 && (
        <div className="loading-container">No measurements available.</div>
      )}
    </div>
  );
}
