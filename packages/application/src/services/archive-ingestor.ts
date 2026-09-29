import type {
  WeatherDataSource,
  ArchiveRecordRepository,
  ObservationRepository,
  SyncWindowRepository,
  StationId,
  SensorId,
  Clock,
} from '@weather/domain';

export interface IngestOptions {
  /** Replace historic observations already stored for the window instead of keeping them. */
  readonly replace?: boolean;
}

/**
 * Fetches one archive window (at most 24 hours), keeps the raw records,
 * stores the mapped observations and marks the window as synced.
 */
export class ArchiveIngestor {
  constructor(
    private readonly weatherSource: WeatherDataSource,
    private readonly archiveRepo: ArchiveRecordRepository,
    private readonly observationRepo: ObservationRepository,
    private readonly syncWindowRepo: SyncWindowRepository,
    private readonly clock: Clock,
  ) {}

  async ingest(
    stationId: StationId,
    sensorId: SensorId,
    from: Date,
    to: Date,
    options: IngestOptions = {},
  ): Promise<number> {
    const records = await this.weatherSource.getHistoricArchive(
      stationId,
      Math.floor(from.getTime() / 1000),
      Math.floor(to.getTime() / 1000),
    );

    if (records.length > 0) {
      await this.archiveRepo.saveMany(records);
    }

    const observations = this.weatherSource.mapArchiveRecords(records);

    if (options.replace) {
      await this.observationRepo.deleteByStationAndTimeRange(stationId, from, to, 'historic');
    }
    if (observations.length > 0) {
      await this.observationRepo.saveMany(observations);
    }

    await this.syncWindowRepo.save({
      stationId,
      sensorId,
      startTimestamp: from,
      endTimestamp: to,
      syncedAt: this.clock.now(),
      observationCount: observations.length,
    });

    return observations.length;
  }
}
