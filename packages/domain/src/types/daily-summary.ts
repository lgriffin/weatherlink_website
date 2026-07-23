import type { StationId } from './ids.js';
import type { MeasurementName } from './measurement.js';
import type { CanonicalUnit } from './units.js';

export interface DailySummary {
  readonly stationId: StationId;
  readonly date: string;
  readonly measurementName: MeasurementName;
  readonly unit: CanonicalUnit;
  readonly min: number | null;
  readonly max: number | null;
  readonly avg: number | null;
  readonly count: number;
}
