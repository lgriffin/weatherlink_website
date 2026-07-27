import { useQuery } from '@tanstack/react-query';
import { fetchTimeSeries } from '../api/client';

export function useSparklineData(metrics: string[]): Map<string, Array<{ timestamp: number; value: number | null }>> {
  const now = Date.now();
  const from = new Date(now - 24 * 3600000).toISOString();
  const to = new Date(now).toISOString();

  const { data } = useQuery({
    queryKey: ['sparklines', metrics],
    queryFn: () => fetchTimeSeries(metrics, from, to, 'hourly'),
    staleTime: 300_000,
    refetchInterval: 300_000,
    enabled: metrics.length > 0,
  });

  const result = new Map<string, Array<{ timestamp: number; value: number | null }>>();
  if (data?.series) {
    for (const s of data.series) {
      result.set(s.metric, s.points);
    }
  }
  return result;
}
