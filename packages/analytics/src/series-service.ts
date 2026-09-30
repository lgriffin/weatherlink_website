import type { Observation, DailySummary, MeasurementName, CanonicalUnit } from '@weather/domain';
import { MEASUREMENT_UNITS } from '@weather/domain';
import { DAILY_TOTAL_MEASUREMENTS } from './aggregation-service.js';

export type Resolution = 'raw' | 'hourly' | 'daily';

export interface SeriesPoint {
  readonly timestamp: number;
  readonly value: number | null;
}

export interface SeriesResult {
  readonly metric: MeasurementName;
  readonly unit: CanonicalUnit;
  readonly resolution: Resolution;
  readonly points: SeriesPoint[];
}

export function buildSeriesFromObservations(
  metric: MeasurementName,
  observations: readonly Observation[],
  resolution: Resolution,
): SeriesResult {
  const unit = MEASUREMENT_UNITS[metric] ?? 'celsius';

  if (resolution === 'raw') {
    const points: SeriesPoint[] = [];
    for (const obs of observations) {
      const m = obs.measurements.get(metric);
      if (m) {
        points.push({ timestamp: obs.timestamp.getTime(), value: m.value });
      }
    }
    points.sort((a, b) => a.timestamp - b.timestamp);
    return { metric, unit, resolution, points };
  }

  // hourly aggregation
  const buckets = new Map<number, number[]>();

  for (const obs of observations) {
    const m = obs.measurements.get(metric);
    if (!m || m.value === null) continue;

    const ts = obs.timestamp.getTime();
    const bucketKey = Math.floor(ts / 3600000) * 3600000;
    let bucket = buckets.get(bucketKey);
    if (!bucket) {
      bucket = [];
      buckets.set(bucketKey, bucket);
    }
    bucket.push(m.value);
  }

  const points: SeriesPoint[] = [];
  for (const [ts, values] of buckets) {
    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
    points.push({ timestamp: ts, value: Math.round(avg * 100) / 100 });
  }
  points.sort((a, b) => a.timestamp - b.timestamp);

  return { metric, unit, resolution: 'hourly', points };
}

export function buildSeriesFromSummaries(
  metric: MeasurementName,
  summaries: readonly DailySummary[],
  field: 'min' | 'max' | 'avg',
): SeriesResult {
  const unit = MEASUREMENT_UNITS[metric] ?? 'celsius';
  const points: SeriesPoint[] = [];

  for (const s of summaries) {
    if (s.measurementName !== metric) continue;
    // A daily total (rain, wind run, ...) is stored as max; its avg is null.
    const value = field === 'avg' && DAILY_TOTAL_MEASUREMENTS.has(metric) ? s.max : s[field];
    const ts = new Date(`${s.date}T12:00:00Z`).getTime();
    points.push({ timestamp: ts, value });
  }

  points.sort((a, b) => a.timestamp - b.timestamp);
  return { metric, unit, resolution: 'daily', points };
}
