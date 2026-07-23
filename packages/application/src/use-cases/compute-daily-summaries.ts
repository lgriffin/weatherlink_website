import type {
  StationRepository,
  ObservationRepository,
  DailySummaryRepository,
} from '@weather/domain';
import { computeDailySummaries } from '@weather/analytics';
import type { Logger } from '@weather/observability';

export class ComputeDailySummaries {
  constructor(
    private readonly stationRepo: StationRepository,
    private readonly observationRepo: ObservationRepository,
    private readonly dailySummaryRepo: DailySummaryRepository,
    private readonly logger: Logger,
  ) {}

  async execute(date: string): Promise<void> {
    const station = await this.stationRepo.findActive();
    if (!station) {
      this.logger.warn('No active station, skipping daily summary computation');
      return;
    }

    const dayStart = new Date(`${date}T00:00:00Z`);
    const dayEnd = new Date(`${date}T23:59:59.999Z`);

    const observations = await this.observationRepo.findByStationAndTimeRange(
      station.id, dayStart, dayEnd,
    );

    if (observations.length === 0) {
      this.logger.debug({ date }, 'No observations for date, skipping summaries');
      return;
    }

    const summaries = computeDailySummaries(station.id, date, observations);
    await this.dailySummaryRepo.saveMany(summaries);

    this.logger.info(
      { date, summaryCount: summaries.length, observationCount: observations.length },
      'Daily summaries computed',
    );
  }
}
