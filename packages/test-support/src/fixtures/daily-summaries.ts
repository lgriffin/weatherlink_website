import type { DailySummary, MeasurementName, CanonicalUnit } from '@weather/domain';
import { stationId } from '@weather/domain';

export function aDailySummary(overrides?: Partial<DailySummary>): DailySummary {
  return {
    stationId: stationId('station-1'),
    date: '2026-07-17',
    measurementName: 'temperature.outdoor' as MeasurementName,
    unit: 'celsius' as CanonicalUnit,
    min: 12.5,
    max: 24.3,
    avg: 18.4,
    count: 96,
    ...overrides,
  };
}
