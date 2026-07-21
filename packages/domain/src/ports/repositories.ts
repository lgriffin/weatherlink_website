import type { StationId, SensorId } from '../types/ids.js';
import type { WeatherStation } from '../types/station.js';
import type { Sensor } from '../types/sensor.js';
import type { Observation } from '../types/observation.js';

export interface StationRepository {
  findById(id: StationId): Promise<WeatherStation | null>;
  findActive(): Promise<WeatherStation | null>;
  findAll(): Promise<WeatherStation[]>;
  save(station: WeatherStation): Promise<void>;
  saveMany(stations: WeatherStation[]): Promise<void>;
}

export interface SensorRepository {
  findByStationId(stationId: StationId): Promise<Sensor[]>;
  findById(id: SensorId): Promise<Sensor | null>;
  save(sensor: Sensor): Promise<void>;
  saveMany(sensors: Sensor[]): Promise<void>;
}

export interface ObservationRepository {
  findLatestByStation(stationId: StationId): Promise<Observation | null>;
  findByStationAndTimeRange(
    stationId: StationId,
    from: Date,
    to: Date,
  ): Promise<Observation[]>;
  save(observation: Observation): Promise<void>;
  saveMany(observations: Observation[]): Promise<void>;
}

// Phase 2+ stubs
export interface DailySummaryRepository {}
export interface RecordRepository {}
export interface SyncWindowRepository {}
export interface SensorCatalogRepository {}
