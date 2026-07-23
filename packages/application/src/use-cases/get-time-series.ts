import type {
  StationRepository,
  ObservationRepository,
  DailySummaryRepository,
  MeasurementName,
} from '@weather/domain';
import {
  buildSeriesFromObservations,
  buildSeriesFromSummaries,
  type Resolution,
  type SeriesResult,
} from '@weather/analytics';

export class GetTimeSeries {
  constructor(
    private readonly stationRepo: StationRepository,
    private readonly observationRepo: ObservationRepository,
    private readonly dailySummaryRepo: DailySummaryRepository,
  ) {}

  async execute(
    metrics: MeasurementName[],
    from: Date,
    to: Date,
    resolution: Resolution,
  ): Promise<SeriesResult[]> {
    const station = await this.stationRepo.findActive();
    if (!station) return [];

    if (resolution === 'daily') {
      const fromDate = from.toISOString().substring(0, 10);
      const toDate = to.toISOString().substring(0, 10);
      const summaries = await this.dailySummaryRepo.findByStationAndDateRange(
        station.id, fromDate, toDate,
      );
      return metrics.map((metric) =>
        buildSeriesFromSummaries(metric, summaries, 'avg'),
      );
    }

    const observations = await this.observationRepo.findByStationAndTimeRange(
      station.id, from, to,
    );
    return metrics.map((metric) =>
      buildSeriesFromObservations(metric, observations, resolution),
    );
  }
}
