import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { fetchCurrentConditions, fetchStation } from '../api/client';
import { FreshnessBadge } from '../components/FreshnessBadge';
import { MeasurementCard } from '../components/MeasurementCard';
import { HeroCard } from '../components/HeroCard';
import { CategorySection } from '../components/CategorySection';
import { useSparklineData } from '../hooks/useSparklineData';
import {
  DASHBOARD_ORDER,
  HERO_METRICS,
  CATEGORY_ORDER,
  getCategory,
} from '../config/measurements';

export const Route = createFileRoute('/')({
  component: NowDashboard,
});

const HERO_KEYS = new Set([
  ...HERO_METRICS.temperature,
  ...HERO_METRICS.wind,
  ...HERO_METRICS.rain,
]);

const SPARKLINE_METRICS = DASHBOARD_ORDER.filter((k) => k !== 'wind.direction');

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

  const sparklines = useSparklineData(SPARKLINE_METRICS);

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

  const nonHeroKeys = DASHBOARD_ORDER.filter(
    (key) => !HERO_KEYS.has(key) && current.measurements[key] !== undefined,
  );

  const extraKeys = Object.keys(current.measurements).filter(
    (key) => !DASHBOARD_ORDER.includes(key),
  );

  const regularKeys = [...nonHeroKeys, ...extraKeys];

  const categorized = new Map<string, Array<{ key: string; value: number | null; unit: string; timestamp: string | null }>>();
  for (const key of regularKeys) {
    const m = current.measurements[key];
    if (!m) continue;
    const cat = getCategory(key);
    let list = categorized.get(cat);
    if (!list) {
      list = [];
      categorized.set(cat, list);
    }
    list.push({ key, ...m });
  }

  return (
    <div>
      <div className="page-header">
        <h2>{station?.stations.find((s) => s.isActive)?.name ?? current.stationName}</h2>
        <FreshnessBadge state={current.freshness.state} ageSeconds={current.freshness.ageSeconds} />
      </div>

      <div className="hero-grid">
        <HeroCard
          type="temperature"
          measurements={current.measurements}
          sparklineData={sparklines.get('temperature.outdoor')}
        />
        <HeroCard
          type="wind"
          measurements={current.measurements}
          sparklineData={sparklines.get('wind.speed')}
        />
        <HeroCard
          type="rain"
          measurements={current.measurements}
          sparklineData={sparklines.get('rain.rate')}
        />
      </div>

      {CATEGORY_ORDER.map((cat) => {
        const items = categorized.get(cat.key);
        if (!items || items.length === 0) return null;
        return (
          <CategorySection key={cat.key} label={cat.label}>
            {items.map((m) => (
              <MeasurementCard
                key={m.key}
                label={m.key}
                value={m.value}
                unit={m.unit}
                timestamp={m.timestamp}
                sparklineData={sparklines.get(m.key)}
              />
            ))}
          </CategorySection>
        );
      })}

      {/* Uncategorized measurements */}
      {(() => {
        const knownCats = new Set(CATEGORY_ORDER.map((c) => c.key));
        const uncategorized = regularKeys.filter((k) => !knownCats.has(getCategory(k)));
        if (uncategorized.length === 0) return null;
        return (
          <CategorySection label="Other">
            {uncategorized.map((key) => {
              const m = current.measurements[key]!;
              return (
                <MeasurementCard
                  key={key}
                  label={key}
                  value={m.value}
                  unit={m.unit}
                  timestamp={m.timestamp}
                  sparklineData={sparklines.get(key)}
                />
              );
            })}
          </CategorySection>
        );
      })()}

      {Object.keys(current.measurements).length === 0 && (
        <div className="loading-container">No measurements available.</div>
      )}
    </div>
  );
}
