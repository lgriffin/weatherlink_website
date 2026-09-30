import type { StationRepository, DailySummaryRepository, Clock } from '@weather/domain';
import { addDays, localDateOf } from '@weather/domain';
import { completeDates, annualThresholds, type AnnualThresholds } from '@weather/analytics';

export interface AnnualStats extends AnnualThresholds {
  /** Latest complete local day included (yesterday). */
  readonly asOf: string;
}

/** Warm, cold and wet day counts per month for the latest few years, side by side. */
export class GetAnnualStats {
  constructor(
    private readonly stationRepo: StationRepository,
    private readonly dailySummaryRepo: DailySummaryRepository,
    private readonly clock: Clock,
    private readonly timeZone: string = 'UTC',
  ) {}

  async execute(yearCount = 3): Promise<AnnualStats> {
    const asOf = addDays(localDateOf(this.clock.now(), this.timeZone), -1);
    const latest = Number(asOf.substring(0, 4));
    const years = Array.from({ length: yearCount }, (_, i) => String(latest - yearCount + 1 + i));

    const station = await this.stationRepo.findActive();
    const summaries = station
      ? await this.dailySummaryRepo.findByStationAndDateRange(station.id, '1900-01-01', asOf)
      : [];

    return { asOf, ...annualThresholds(summaries, completeDates(summaries), years, asOf) };
  }
}
