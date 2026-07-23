import type {
  StationRepository,
  DailySummaryRepository,
  RecordRepository,
} from '@weather/domain';
import { deriveRecords } from '@weather/analytics';
import type { Logger } from '@weather/observability';

export class ComputeRecords {
  constructor(
    private readonly stationRepo: StationRepository,
    private readonly dailySummaryRepo: DailySummaryRepository,
    private readonly recordRepo: RecordRepository,
    private readonly logger: Logger,
  ) {}

  async execute(): Promise<void> {
    const station = await this.stationRepo.findActive();
    if (!station) {
      this.logger.warn('No active station, skipping records computation');
      return;
    }

    const allSummaries = await this.dailySummaryRepo.findByStationAndDateRange(
      station.id, '1900-01-01', '2099-12-31',
    );

    if (allSummaries.length === 0) {
      this.logger.debug('No daily summaries, skipping records');
      return;
    }

    const records = deriveRecords(station.id, allSummaries);

    await this.recordRepo.deleteByStation(station.id);
    await this.recordRepo.saveMany(records);

    this.logger.info({ recordCount: records.length }, 'Records recomputed');
  }
}
