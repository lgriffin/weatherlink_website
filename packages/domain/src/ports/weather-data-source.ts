import type { StationId } from '../types/ids.js';
import type { WeatherStation } from '../types/station.js';
import type { Sensor } from '../types/sensor.js';
import type { Observation } from '../types/observation.js';

export interface WeatherDataSource {
  discoverStations(): Promise<WeatherStation[]>;
  getSensors(stationId: StationId): Promise<Sensor[]>;
  getCurrentConditions(stationId: StationId): Promise<Observation[]>;
  getHistoricConditions(
    stationId: StationId,
    startTimestamp: number,
    endTimestamp: number,
  ): Promise<Observation[]>;
}
