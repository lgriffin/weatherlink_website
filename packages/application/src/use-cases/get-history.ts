import type {
  StationRepository,
  DailySummaryRepository,
  DailySummary,
  MeasurementName,
} from '@weather/domain';

export interface HistoryResult {
  monthDay: string;
  measurements: Map<MeasurementName, Map<string, DailySummary>>;
}

export class GetHistory {
  constructor(
    private readonly stationRepo: StationRepository,
    private readonly dailySummaryRepo: DailySummaryRepository,
  ) {}

  async execute(monthDay: string): Promise<HistoryResult> {
    const station = await this.stationRepo.findActive();
    if (!station) return { monthDay, measurements: new Map() };

    const keyMeasurements: MeasurementName[] = [
      'temperature.outdoor',
      'humidity.outdoor',
      'pressure.seaLevel',
      'wind.gust',
      'rain.daily',
    ];

    const measurements = new Map<MeasurementName, Map<string, DailySummary>>();

    for (const name of keyMeasurements) {
      const summaries = await this.dailySummaryRepo.findByStationDateAndMeasurement(
        station.id, monthDay, name,
      );

      const byYear = new Map<string, DailySummary>();
      for (const s of summaries) {
        const year = s.date.substring(0, 4);
        byYear.set(year, s);
      }
      measurements.set(name, byYear);
    }

    return { monthDay, measurements };
  }
}
