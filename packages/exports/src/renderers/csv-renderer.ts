import type { Observation, MeasurementName } from '@weather/domain';

export function renderCsv(
  observations: readonly Observation[],
  metrics: MeasurementName[],
): string {
  const headers = ['timestamp', ...metrics];
  const rows = [headers.join(',')];

  for (const obs of observations) {
    const values: string[] = [obs.timestamp.toISOString()];
    for (const metric of metrics) {
      const m = obs.measurements.get(metric);
      values.push(m?.value !== null && m?.value !== undefined ? String(m.value) : '');
    }
    rows.push(values.join(','));
  }

  return rows.join('\n');
}
