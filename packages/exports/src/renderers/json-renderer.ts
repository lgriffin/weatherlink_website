import type { Observation, MeasurementName } from '@weather/domain';

export function renderJson(
  observations: readonly Observation[],
  metrics: MeasurementName[],
): string {
  const data = observations.map((obs) => {
    const measurements: Record<string, number | null> = {};
    for (const metric of metrics) {
      const m = obs.measurements.get(metric);
      measurements[metric] = m?.value ?? null;
    }
    return {
      timestamp: obs.timestamp.toISOString(),
      stationId: String(obs.stationId),
      measurements,
    };
  });

  return JSON.stringify({ observations: data, exportedAt: new Date().toISOString() }, null, 2);
}
