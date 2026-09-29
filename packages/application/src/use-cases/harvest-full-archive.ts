import type {
  StationRepository,
  SensorRepository,
  SyncWindowRepository,
  Clock,
} from '@weather/domain';
import type { Logger } from '@weather/observability';
import type { ArchiveIngestor } from '../services/archive-ingestor.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const PROGRESS_EVERY_DAYS = 30;

export interface HarvestOptions {
  /** Defaults to the station's registration date. */
  readonly from?: Date;
  /** Defaults to now. */
  readonly to?: Date;
  /** Re-download days that were already synced and replace their observations. */
  readonly force?: boolean;
}

export interface HarvestResult {
  readonly daysFetched: number;
  readonly daysSkipped: number;
  readonly daysFailed: number;
  readonly observations: number;
}

/**
 * Downloads the station's archive one day at a time (the upstream API allows
 * at most 24 hours per request), keeping every raw record. Resumable: days
 * already synced are skipped unless `force` is set.
 */
export class HarvestFullArchive {
  constructor(
    private readonly ingestor: ArchiveIngestor,
    private readonly stationRepo: StationRepository,
    private readonly sensorRepo: SensorRepository,
    private readonly syncWindowRepo: SyncWindowRepository,
    private readonly clock: Clock,
    private readonly logger: Logger,
    private readonly delayMs: number = 2000,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  async execute(options: HarvestOptions = {}): Promise<HarvestResult> {
    const result = { daysFetched: 0, daysSkipped: 0, daysFailed: 0, observations: 0 };

    const station = await this.stationRepo.findActive();
    if (!station) {
      this.logger.warn('No active station, skipping archive harvest');
      return result;
    }

    const sensors = await this.sensorRepo.findByStationId(station.id);
    const issSensor = sensors.find((s) => s.category === 'iss');
    if (!issSensor) {
      this.logger.warn('No ISS sensor found, skipping archive harvest');
      return result;
    }

    const from = options.from ?? station.registeredAt;
    const to = options.to ?? this.clock.now();
    const totalDays = Math.ceil((to.getTime() - from.getTime()) / ONE_DAY_MS);

    this.logger.info(
      { from: from.toISOString(), to: to.toISOString(), totalDays, force: options.force ?? false },
      'Starting full archive harvest',
    );

    for (let start = from.getTime(), day = 0; start < to.getTime(); start += ONE_DAY_MS, day++) {
      const chunkFrom = new Date(start);
      const chunkTo = new Date(Math.min(start + ONE_DAY_MS, to.getTime()));

      if (!options.force) {
        const gaps = await this.syncWindowRepo.findGaps(station.id, issSensor.id, chunkFrom, chunkTo);
        if (gaps.length === 0) {
          result.daysSkipped++;
          continue;
        }
      }

      try {
        result.observations += await this.ingestor.ingest(
          station.id,
          issSensor.id,
          chunkFrom,
          chunkTo,
          { replace: options.force ?? false },
        );
        result.daysFetched++;
      } catch (error) {
        result.daysFailed++;
        this.logger.error({ err: error, from: chunkFrom.toISOString() }, 'Harvest day failed');
      }

      if ((day + 1) % PROGRESS_EVERY_DAYS === 0) {
        this.logger.info({ day: day + 1, totalDays, ...result }, 'Harvest progress');
      }

      await this.sleep(this.delayMs);
    }

    this.logger.info(result, 'Full archive harvest completed');
    return result;
  }
}
