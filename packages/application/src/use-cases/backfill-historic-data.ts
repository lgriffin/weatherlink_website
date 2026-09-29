import type {
  StationRepository,
  SensorRepository,
  SyncWindowRepository,
  Clock,
} from '@weather/domain';
import type { Logger } from '@weather/observability';
import type { ArchiveIngestor } from '../services/archive-ingestor.js';

const ONE_DAY_SECONDS = 24 * 60 * 60;
const DELAY_BETWEEN_REQUESTS_MS = 2000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class BackfillHistoricData {
  constructor(
    private readonly ingestor: ArchiveIngestor,
    private readonly stationRepo: StationRepository,
    private readonly sensorRepo: SensorRepository,
    private readonly syncWindowRepo: SyncWindowRepository,
    private readonly clock: Clock,
    private readonly logger: Logger,
    private readonly backfillDays: number = 7,
  ) {}

  async execute(): Promise<void> {
    const station = await this.stationRepo.findActive();
    if (!station) {
      this.logger.warn('No active station, skipping backfill');
      return;
    }

    const sensors = await this.sensorRepo.findByStationId(station.id);
    const issSensor = sensors.find((s) => s.category === 'iss');
    if (!issSensor) {
      this.logger.warn('No ISS sensor found, skipping backfill');
      return;
    }

    const now = this.clock.now();
    const backfillStart = this.backfillDays > 0
      ? new Date(now.getTime() - this.backfillDays * ONE_DAY_SECONDS * 1000)
      : station.registeredAt;

    const gaps = await this.syncWindowRepo.findGaps(
      station.id,
      issSensor.id,
      backfillStart,
      now,
    );

    if (gaps.length === 0) {
      this.logger.info('No gaps found for backfill period');
      return;
    }

    this.logger.info(
      { gapCount: gaps.length, backfillDays: this.backfillDays },
      'Starting historic backfill',
    );

    let totalObservations = 0;

    for (const gap of gaps) {
      let chunkStart = Math.floor(gap.from.getTime() / 1000);
      const end = Math.floor(gap.to.getTime() / 1000);

      while (chunkStart < end) {
        const chunkEnd = Math.min(chunkStart + ONE_DAY_SECONDS, end);

        try {
          totalObservations += await this.ingestor.ingest(
            station.id,
            issSensor.id,
            new Date(chunkStart * 1000),
            new Date(chunkEnd * 1000),
          );
        } catch (error) {
          this.logger.error(
            { err: error, from: chunkStart, to: chunkEnd },
            'Backfill chunk failed',
          );
        }

        chunkStart = chunkEnd;
        await delay(DELAY_BETWEEN_REQUESTS_MS);
      }
    }

    this.logger.info(
      { totalObservations, backfillDays: this.backfillDays },
      'Backfill completed',
    );
  }
}
