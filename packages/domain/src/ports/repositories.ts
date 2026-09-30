import type { StationId, SensorId } from '../types/ids.js';
import type { WeatherStation } from '../types/station.js';
import type { Sensor } from '../types/sensor.js';
import type { Observation } from '../types/observation.js';
import type { SyncWindow } from '../types/sync-window.js';
import type { DailySummary } from '../types/daily-summary.js';
import type { WeatherRecord, RecordScope } from '../types/record.js';
import type { MeasurementName } from '../types/measurement.js';
import type { ArchiveRecord } from '../types/archive-record.js';
import type { ObservationSource } from '../types/observation.js';
import type { IngestKind, IngestReport, NewIngestReport } from '../types/ingest-report.js';

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
  findDistinctDatesByStation(stationId: StationId): Promise<string[]>;
  save(observation: Observation): Promise<void>;
  saveMany(observations: Observation[]): Promise<void>;
  deleteOlderThan(cutoff: Date): Promise<number>;
  /** Deletes observations with timestamp in [from, to) from one source. */
  deleteByStationAndTimeRange(
    stationId: StationId,
    from: Date,
    to: Date,
    source: ObservationSource,
  ): Promise<number>;
}

export interface ArchiveRecordRepository {
  /** Inserts or replaces records keyed by station, sensor and timestamp. */
  saveMany(records: ArchiveRecord[]): Promise<void>;
  /** Records with timestamp in [from, to). */
  findByStationAndTimeRange(stationId: StationId, from: Date, to: Date): Promise<ArchiveRecord[]>;
  findTimeBounds(stationId: StationId): Promise<{ earliest: Date; latest: Date } | null>;
  countByStation(stationId: StationId): Promise<number>;
}

export interface SyncWindowRepository {
  findByStationAndSensor(stationId: StationId, sensorId: SensorId): Promise<SyncWindow[]>;
  findGaps(
    stationId: StationId,
    sensorId: SensorId,
    from: Date,
    to: Date,
  ): Promise<Array<{ from: Date; to: Date }>>;
  save(syncWindow: SyncWindow): Promise<void>;
}

export interface DailySummaryRepository {
  findByStationAndDate(stationId: StationId, date: string): Promise<DailySummary[]>;
  findByStationAndDateRange(
    stationId: StationId,
    fromDate: string,
    toDate: string,
  ): Promise<DailySummary[]>;
  findByStationDateAndMeasurement(
    stationId: StationId,
    monthDay: string,
    measurementName: MeasurementName,
  ): Promise<DailySummary[]>;
  findDistinctDatesByStation(stationId: StationId): Promise<string[]>;
  save(summary: DailySummary): Promise<void>;
  saveMany(summaries: DailySummary[]): Promise<void>;
  deleteOlderThan(cutoff: string): Promise<number>;
  deleteByStation(stationId: StationId): Promise<number>;
}

export interface RecordRepository {
  findByStation(stationId: StationId, scope?: RecordScope): Promise<WeatherRecord[]>;
  findByStationAndMeasurement(
    stationId: StationId,
    measurementName: MeasurementName,
  ): Promise<WeatherRecord[]>;
  save(record: WeatherRecord): Promise<void>;
  saveMany(records: WeatherRecord[]): Promise<void>;
  deleteByStation(stationId: StationId): Promise<void>;
}

export interface IngestReportRepository {
  save(report: NewIngestReport): Promise<IngestReport>;
  findLatest(kind: IngestKind): Promise<IngestReport | null>;
  /** Newest first, without payloads' size mattering to the caller. */
  findRecent(limit: number): Promise<IngestReport[]>;
  /** Keep the newest `keep` reports of a kind; returns how many were removed. */
  prune(kind: IngestKind, keep: number): Promise<number>;
}

export interface SensorCatalogRepository {}
