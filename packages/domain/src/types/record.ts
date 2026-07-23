import type { StationId } from './ids.js';
import type { MeasurementName } from './measurement.js';
import type { CanonicalUnit } from './units.js';

export type RecordScope = 'all-time' | 'monthly' | 'yearly';
export type RecordType = 'high' | 'low';

export interface WeatherRecord {
  readonly stationId: StationId;
  readonly measurementName: MeasurementName;
  readonly unit: CanonicalUnit;
  readonly scope: RecordScope;
  readonly scopeKey: string;
  readonly recordType: RecordType;
  readonly value: number;
  readonly date: string;
}
