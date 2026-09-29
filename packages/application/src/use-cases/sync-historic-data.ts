import type {
  StationRepository,
  SensorRepository,
  SyncWindowRepository,
  Clock,
} from '@weather/domain';
import type { Logger } from '@weather/observability';
import type { ArchiveIngestor } from '../services/archive-ingestor.js';

const ONE_DAY_SECONDS = 24 * 60 * 60;

export class SyncHistoricData {
  constructor(
    private readonly ingestor: ArchiveIngestor,
    private readonly stationRepo: StationRepository,
    private readonly sensorRepo: SensorRepository,
    private readonly syncWindowRepo: SyncWindowRepository,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async execute(): Promise<void> {
    const station = await this.stationRepo.findActive();
    if (!station) {
      this.logger.warn('No active station, skipping historic sync');
      return;
    }

    const sensors = await this.sensorRepo.findByStationId(station.id);
    const issSensor = sensors.find((s) => s.category === 'iss');
    if (!issSensor) {
      this.logger.warn('No ISS sensor found, skipping historic sync');
      return;
    }

    const now = this.clock.now();
    const oneDayAgo = new Date(now.getTime() - ONE_DAY_SECONDS * 1000);

    const gaps = await this.syncWindowRepo.findGaps(
      station.id,
      issSensor.id,
      oneDayAgo,
      now,
    );

    if (gaps.length === 0) {
      this.logger.debug('No gaps in last 24h, skipping historic sync');
      return;
    }

    for (const gap of gaps) {
      await this.syncChunk(station.id, issSensor.id, gap.from, gap.to);
    }
  }

  private async syncChunk(
    stationId: import('@weather/domain').StationId,
    sensorId: import('@weather/domain').SensorId,
    from: Date,
    to: Date,
  ): Promise<void> {
    let chunkStart = Math.floor(from.getTime() / 1000);
    const end = Math.floor(to.getTime() / 1000);

    while (chunkStart < end) {
      const chunkEnd = Math.min(chunkStart + ONE_DAY_SECONDS, end);

      try {
        const observationCount = await this.ingestor.ingest(
          stationId,
          sensorId,
          new Date(chunkStart * 1000),
          new Date(chunkEnd * 1000),
        );

        this.logger.info(
          {
            stationId: String(stationId),
            from: new Date(chunkStart * 1000).toISOString(),
            to: new Date(chunkEnd * 1000).toISOString(),
            observationCount,
          },
          'Historic chunk synced',
        );
      } catch (error) {
        this.logger.error(
          { err: error, stationId: String(stationId), from: chunkStart, to: chunkEnd },
          'Historic chunk sync failed',
        );
      }

      chunkStart = chunkEnd;
    }
  }
}
