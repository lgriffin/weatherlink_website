import type { StationRepository, DailySummaryRepository, Clock } from '@weather/domain';
import { addDays, localDateOf } from '@weather/domain';
import {
  completeDates,
  runningTotals,
  monthScorecards,
  weatherRuns,
  type YearRunningTotal,
  type MonthScore,
  type WeatherRun,
} from '@weather/analytics';

/** Measurements whose daily total is meaningful to accumulate through a year. */
export const RUNNING_TOTAL_METRICS = [
  'rain.daily',
  'degreeDays.heating',
  'degreeDays.cooling',
  'evapotranspiration',
  'wind.run',
] as const;

export type RunningTotalMetric = (typeof RUNNING_TOTAL_METRICS)[number];

export interface YearComparison {
  /** Latest complete local day included (yesterday). */
  readonly asOf: string;
  readonly metric: RunningTotalMetric;
  readonly month: number;
  readonly runningTotals: YearRunningTotal[];
  readonly monthScores: MonthScore[];
  readonly runs: WeatherRun[];
}

export class GetYearComparison {
  constructor(
    private readonly stationRepo: StationRepository,
    private readonly dailySummaryRepo: DailySummaryRepository,
    private readonly clock: Clock,
    private readonly timeZone: string = 'UTC',
  ) {}

  async execute(metric: RunningTotalMetric, month: number): Promise<YearComparison> {
    const asOf = addDays(localDateOf(this.clock.now(), this.timeZone), -1);
    const empty = { asOf, metric, month, runningTotals: [], monthScores: [], runs: [] };

    const station = await this.stationRepo.findActive();
    if (!station) return empty;

    const summaries = await this.dailySummaryRepo.findByStationAndDateRange(
      station.id, '1900-01-01', asOf,
    );
    if (summaries.length === 0) return empty;

    const complete = completeDates(summaries);

    return {
      asOf,
      metric,
      month,
      runningTotals: runningTotals(summaries, metric, complete, asOf),
      monthScores: monthScorecards(summaries, month, complete),
      runs: weatherRuns(summaries, complete),
    };
  }
}
