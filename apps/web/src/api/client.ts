import {
  CurrentConditionsResponseSchema,
  type CurrentConditionsResponse,
  RecordsListResponseSchema,
  type RecordsListResponse,
  HistoryResponseSchema,
  type HistoryResponse,
  TimeSeriesResponseSchema,
  type TimeSeriesResponse,
  YearComparisonResponseSchema,
  type YearComparisonResponse,
  AnnualStatsResponseSchema,
  type AnnualStatsResponse,
} from '@weather/contracts';
import { IS_STATIC, dataUrl, nearestSnapshotHours } from '../config/site';

/** The live API path, or the matching file in the static snapshot. */
async function getJson(livePath: string, snapshotPath: string): Promise<unknown> {
  const res = await fetch(IS_STATIC ? dataUrl(snapshotPath) : livePath);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchCurrentConditions(): Promise<CurrentConditionsResponse> {
  return CurrentConditionsResponseSchema.parse(await getJson('/api/v1/current', 'current.json'));
}

export interface StationInfo {
  stations: Array<{
    id: string;
    name: string;
    timezone: string;
    latitude: number | null;
    longitude: number | null;
    elevationMetres: number | null;
    isActive: boolean;
  }>;
  activeStationId: string | null;
}

export async function fetchStation(): Promise<StationInfo> {
  return (await getJson('/api/v1/station', 'station.json')) as StationInfo;
}

export interface HealthInfo {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  components: Array<{
    name: string;
    status: 'up' | 'down' | 'unknown';
    latencyMs: number | null;
    message: string | null;
  }>;
}

export async function fetchHealth(): Promise<HealthInfo> {
  // The live endpoint answers 503 with a body when unhealthy, so don't treat that as an error.
  const res = await fetch(IS_STATIC ? dataUrl('health.json') : '/health/ready');
  return res.json();
}

export async function fetchRecords(scope?: string): Promise<RecordsListResponse> {
  const params = scope ? `?scope=${scope}` : '';
  const json = await getJson(`/api/v1/records${params}`, `records/${scope ?? 'all-time'}.json`);
  return RecordsListResponseSchema.parse(json);
}

export async function fetchHistory(monthDay: string): Promise<HistoryResponse> {
  const json = await getJson(`/api/v1/history?date=${monthDay}`, `history/${monthDay}.json`);
  return HistoryResponseSchema.parse(json);
}

export async function fetchTimeSeries(
  metrics: string[],
  from: string,
  to: string,
  resolution: string,
): Promise<TimeSeriesResponse> {
  if (IS_STATIC) {
    // The snapshot holds one file per metric for each window the pages offer.
    const hours = nearestSnapshotHours(from, to);
    const known = new Set((await fetchSnapshotInfo()).seriesMetrics);
    const series = await Promise.all(metrics.filter((m) => known.has(m)).map(async (metric) => {
      const res = await fetch(dataUrl(`series/${resolution}/${hours}/${metric}.json`));
      return res.ok ? res.json() : null;
    }));
    return TimeSeriesResponseSchema.parse({ series: series.filter((s) => s !== null) });
  }
  const params = new URLSearchParams({
    metrics: metrics.join(','),
    from,
    to,
    resolution,
  });
  const res = await fetch(`/api/v1/series?${params}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const json = await res.json();
  return TimeSeriesResponseSchema.parse(json);
}

export async function fetchYearComparison(metric: string, month: number): Promise<YearComparisonResponse> {
  const params = new URLSearchParams({ metric, month: String(month) });
  const json = await getJson(`/api/v1/compare?${params}`, `compare/${metric}/${month}.json`);
  return YearComparisonResponseSchema.parse(json);
}

export async function fetchAnnualStats(): Promise<AnnualStatsResponse> {
  return AnnualStatsResponseSchema.parse(await getJson('/api/v1/annual', 'annual.json'));
}

export interface SnapshotInfo {
  generatedAt: string;
  /** Metrics with series files in the snapshot. */
  seriesMetrics: string[];
}

let snapshotInfo: Promise<SnapshotInfo> | null = null;

/** When the static snapshot was taken and what it holds (static builds only). */
export function fetchSnapshotInfo(): Promise<SnapshotInfo> {
  snapshotInfo ??= getJson('', 'meta.json').then((json) => json as SnapshotInfo);
  snapshotInfo.catch(() => { snapshotInfo = null; });
  return snapshotInfo;
}
