import {
  CurrentConditionsResponseSchema,
  type CurrentConditionsResponse,
  RecordsListResponseSchema,
  type RecordsListResponse,
  HistoryResponseSchema,
  type HistoryResponse,
  TimeSeriesResponseSchema,
  type TimeSeriesResponse,
} from '@weather/contracts';

export async function fetchCurrentConditions(): Promise<CurrentConditionsResponse> {
  const res = await fetch('/api/v1/current');
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  const json = await res.json();
  return CurrentConditionsResponseSchema.parse(json);
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
  const res = await fetch('/api/v1/station');
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  return res.json();
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
  const res = await fetch('/health/ready');
  return res.json();
}

export async function fetchRecords(scope?: string): Promise<RecordsListResponse> {
  const params = scope ? `?scope=${scope}` : '';
  const res = await fetch(`/api/v1/records${params}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const json = await res.json();
  return RecordsListResponseSchema.parse(json);
}

export async function fetchHistory(monthDay: string): Promise<HistoryResponse> {
  const res = await fetch(`/api/v1/history?date=${monthDay}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const json = await res.json();
  return HistoryResponseSchema.parse(json);
}

export async function fetchTimeSeries(
  metrics: string[],
  from: string,
  to: string,
  resolution: string,
): Promise<TimeSeriesResponse> {
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
