import type { WeatherRecord, MeasurementName, CanonicalUnit, RecordScope, RecordType } from '@weather/domain';
import { stationId } from '@weather/domain';

export function aRecord(overrides?: Partial<WeatherRecord>): WeatherRecord {
  return {
    stationId: stationId('station-1'),
    measurementName: 'temperature.outdoor' as MeasurementName,
    unit: 'celsius' as CanonicalUnit,
    scope: 'all-time' as RecordScope,
    scopeKey: '',
    recordType: 'high' as RecordType,
    value: 35.2,
    date: '2026-07-15',
    ...overrides,
  };
}
