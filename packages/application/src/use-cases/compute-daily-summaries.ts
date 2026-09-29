import type {
  StationRepository,
  ObservationRepository,
  DailySummaryRepository,
} from '@weather/domain';
import { localDayBounds } from '@weather/domain';
import { computeDailySummaries } from '@weather/analytics';
import type { Logger } from '@weather/observability';

export class ComputeDailySummaries {
  constructor(
    private readonly stationRepo: StationRepository,
    private readonly observationRepo: ObservationRepository,
    private readonly dailySummaryRepo: DailySummaryRepository,
    private readonly logger: Logger,
    private readonly timeZone: string = 'UTC',
  ) {}

  /**
   * Summarises one local calendar day (YYYY-MM-DD in the configured time zone).
   * Returns the number of summaries written; 0 when the day has no data.
   */
  async execute(date: string): Promise<number> {
    const station = await this.stationRepo.findActive();
    if (!station) {
      this.logger.warn('No active station, skipping daily summary computation');
      return 0;
    }

    const { start, end } = localDayBounds(date, this.timeZone);

    const inRange = await this.observationRepo.findByStationAndTimeRange(
      station.id, start, new Date(end.getTime() - 1),
    );

    if (inRange.length === 0) {
      this.logger.debug({ date }, 'No observations for date, skipping summaries');
      return 0;
    }

    // Archive intervals are evenly spaced and carry interval highs, lows and
    // totals. Live polls are denser whenever the poller ran, so mixing the two
    // would skew averages. Use live polls only for days with no archive data.
    const archive = inRange.filter((o) => o.source === 'historic');
    const observations = archive.length > 0 ? archive : inRange;

    const summaries = computeDailySummaries(station.id, date, observations);
    await this.dailySummaryRepo.saveMany(summaries);

    this.logger.info(
      {
        date,
        summaryCount: summaries.length,
        observationCount: observations.length,
        source: archive.length > 0 ? 'archive' : 'live',
      },
      'Daily summaries computed',
    );
    return summaries.length;
  }
}
