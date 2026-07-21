import type { SensorId, StationId } from './ids.js';

export type SensorCategory =
  | 'iss'
  | 'barometer'
  | 'soil'
  | 'leaf'
  | 'health'
  | 'airlink'
  | 'other';

export interface Sensor {
  readonly id: SensorId;
  readonly stationId: StationId;
  readonly lsid: number;
  readonly sensorType: number;
  readonly dataStructureType: number | null;
  readonly name: string;
  readonly category: SensorCategory;
  readonly capabilities: readonly string[];
  readonly isActive: boolean;
}
