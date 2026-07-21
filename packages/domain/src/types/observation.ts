import type { ObservationId, StationId, SensorId } from './ids.js';
import type { Measurement } from './measurement.js';

export type ObservationSource = 'current' | 'historic' | 'local';

export interface Observation {
  readonly id: ObservationId;
  readonly stationId: StationId;
  readonly sensorId: SensorId;
  readonly timestamp: Date;
  readonly receivedAt: Date;
  readonly source: ObservationSource;
  readonly measurements: ReadonlyMap<string, Measurement>;
  readonly rawPayloadHash: string;
}
