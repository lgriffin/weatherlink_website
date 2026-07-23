import type { StationId, SensorId } from './ids.js';

export interface SyncWindow {
  readonly stationId: StationId;
  readonly sensorId: SensorId;
  readonly startTimestamp: Date;
  readonly endTimestamp: Date;
  readonly syncedAt: Date;
  readonly observationCount: number;
}
