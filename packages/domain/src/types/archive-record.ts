import type { SensorId, StationId } from './ids.js';

/**
 * One archive interval exactly as the upstream source delivered it.
 * The payload is opaque to the domain: only the data source adapter knows its
 * shape. Keeping it lets observations be re-derived later without re-downloading.
 */
export interface ArchiveRecord {
  readonly stationId: StationId;
  readonly sensorId: SensorId;
  readonly sensorType: number;
  readonly timestamp: Date;
  readonly intervalMinutes: number | null;
  readonly payload: unknown;
  readonly fetchedAt: Date;
}
