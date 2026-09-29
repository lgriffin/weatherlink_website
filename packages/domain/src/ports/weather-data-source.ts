import type { StationId } from '../types/ids.js';
import type { WeatherStation } from '../types/station.js';
import type { Sensor } from '../types/sensor.js';
import type { Observation } from '../types/observation.js';
import type { ArchiveRecord } from '../types/archive-record.js';

export interface WeatherDataSource {
  discoverStations(): Promise<WeatherStation[]>;
  getSensors(stationId: StationId): Promise<Sensor[]>;
  getCurrentConditions(stationId: StationId): Promise<Observation[]>;
  getHistoricConditions(
    stationId: StationId,
    startTimestamp: number,
    endTimestamp: number,
  ): Promise<Observation[]>;
  /** Raw archive intervals for [start, end], at most 24 hours per call. */
  getHistoricArchive(
    stationId: StationId,
    startTimestamp: number,
    endTimestamp: number,
  ): Promise<ArchiveRecord[]>;
  /** Maps raw archive records to canonical observations. Records it does not understand are skipped. */
  mapArchiveRecords(records: readonly ArchiveRecord[]): Observation[];
}
