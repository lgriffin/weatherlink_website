import type { Branded } from './branded.js';

export type StationId = Branded<string, 'StationId'>;
export type SensorId = Branded<string, 'SensorId'>;
export type ObservationId = Branded<string, 'ObservationId'>;

export function stationId(raw: string): StationId {
  return raw as StationId;
}

export function sensorId(raw: string): SensorId {
  return raw as SensorId;
}

export function observationId(raw: string): ObservationId {
  return raw as ObservationId;
}
