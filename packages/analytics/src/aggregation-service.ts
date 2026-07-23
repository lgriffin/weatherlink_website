import type { Observation, DailySummary, StationId, MeasurementName, CanonicalUnit } from '@weather/domain';

export function computeDailySummaries(
  stationId: StationId,
  date: string,
  observations: readonly Observation[],
): DailySummary[] {
  const byMeasurement = new Map<string, { values: number[]; unit: CanonicalUnit; name: MeasurementName }>();

  for (const obs of observations) {
    for (const [key, m] of obs.measurements) {
      if (m.value === null) continue;
      let entry = byMeasurement.get(key);
      if (!entry) {
        entry = { values: [], unit: m.unit, name: m.name };
        byMeasurement.set(key, entry);
      }
      entry.values.push(m.value);
    }
  }

  const summaries: DailySummary[] = [];

  for (const [, entry] of byMeasurement) {
    const { values, unit, name } = entry;
    if (values.length === 0) continue;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;

    summaries.push({
      stationId,
      date,
      measurementName: name,
      unit,
      min,
      max,
      avg: Math.round(avg * 100) / 100,
      count: values.length,
    });
  }

  return summaries;
}
