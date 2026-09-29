import type {
  WeatherDataSource,
  StationRepository,
  ArchiveRecordRepository,
  ObservationRepository,
  DailySummaryRepository,
  Clock,
} from '@weather/domain';
import { localDateOf } from '@weather/domain';
import type { Logger } from '@weather/observability';
import type { ComputeDailySummaries } from './compute-daily-summaries.js';
import type { ComputeRecords } from './compute-records.js';
import { localDateCandidates } from '../services/summary-dates.js';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface RebuildResult {
  readonly archiveRecords: number;
  readonly observations: number;
  readonly summaryDates: number;
}

/**
 * Re-derives everything from the stored raw archive: historic observations,
 * then every daily summary, then records. Nothing is downloaded.
 */
export class RebuildFromArchive {
  constructor(
    private readonly weatherSource: Pick<WeatherDataSource, 'mapArchiveRecords'>,
    private readonly stationRepo: StationRepository,
    private readonly archiveRepo: ArchiveRecordRepository,
    private readonly observationRepo: ObservationRepository,
    private readonly dailySummaryRepo: DailySummaryRepository,
    private readonly computeDailySummaries: ComputeDailySummaries,
    private readonly computeRecords: ComputeRecords,
    private readonly clock: Clock,
    private readonly logger: Logger,
    private readonly timeZone: string = 'UTC',
  ) {}

  async execute(): Promise<RebuildResult> {
    const result = { archiveRecords: 0, observations: 0, summaryDates: 0 };

    const station = await this.stationRepo.findActive();
    if (!station) {
      this.logger.warn('No active station, skipping rebuild');
      return result;
    }

    const bounds = await this.archiveRepo.findTimeBounds(station.id);
    if (bounds) {
      // Timestamps are stored with second precision, so step past the last one by a full second
      const end = bounds.latest.getTime() + 1000;
      for (let start = bounds.earliest.getTime(); start < end; start += ONE_DAY_MS) {
        const from = new Date(start);
        const to = new Date(Math.min(start + ONE_DAY_MS, end));
        const records = await this.archiveRepo.findByStationAndTimeRange(station.id, from, to);
        const observations = this.weatherSource.mapArchiveRecords(records);

        await this.observationRepo.deleteByStationAndTimeRange(station.id, from, to, 'historic');
        if (observations.length > 0) {
          await this.observationRepo.saveMany(observations);
        }
        result.archiveRecords += records.length;
        result.observations += observations.length;
      }
      this.logger.info(result, 'Observations re-derived from raw archive');
    } else {
      this.logger.warn('No raw archive stored yet; rebuilding summaries from existing observations');
    }

    const deleted = await this.dailySummaryRepo.deleteByStation(station.id);
    this.logger.info({ deleted }, 'Cleared daily summaries');

    const today = localDateOf(this.clock.now(), this.timeZone);
    const utcDates = await this.observationRepo.findDistinctDatesByStation(station.id);
    const dates = localDateCandidates(utcDates, today);

    for (const date of dates) {
      if ((await this.computeDailySummaries.execute(date)) > 0) result.summaryDates++;
    }

    await this.computeRecords.execute();
    this.logger.info(result, 'Rebuild from archive completed');
    return result;
  }
}
