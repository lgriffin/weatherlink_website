import type { ForecastRepository, IngestReportRepository, IssuedForecast } from '@weather/domain';

/** Forecasts are kept as ingest reports of kind "forecast"; this reads the newest one. */
export class IngestForecastRepository implements ForecastRepository {
  constructor(private readonly reports: IngestReportRepository) {}

  async findLatest(): Promise<IssuedForecast | null> {
    const report = await this.reports.findLatest('forecast');
    return report ? { source: report.source, receivedAt: report.receivedAt, payload: report.payload } : null;
  }
}
