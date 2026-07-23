import type {
  StationRepository,
  ObservationRepository,
  MeasurementName,
} from '@weather/domain';
import {
  buildSeriesFromObservations,
  type Resolution,
} from '@weather/analytics';
import {
  generateExport,
  type ExportFormat,
  type ExportResult,
} from '@weather/exports';

const MAX_OBSERVATIONS = 50_000;

export class ExportData {
  constructor(
    private readonly stationRepo: StationRepository,
    private readonly observationRepo: ObservationRepository,
  ) {}

  async execute(
    format: ExportFormat,
    metrics: MeasurementName[],
    from: Date,
    to: Date,
  ): Promise<ExportResult> {
    const station = await this.stationRepo.findActive();
    if (!station) {
      return generateExport({ format, metrics, observations: [] });
    }

    const observations = await this.observationRepo.findByStationAndTimeRange(
      station.id, from, to,
    );

    if (observations.length > MAX_OBSERVATIONS) {
      throw new ExportTooLargeError(observations.length, MAX_OBSERVATIONS);
    }

    const series = format === 'svg'
      ? metrics.map((m) => buildSeriesFromObservations(m, observations, 'hourly' as Resolution))
      : undefined;

    return generateExport({ format, metrics, observations, series });
  }
}

export class ExportTooLargeError extends Error {
  constructor(
    public readonly count: number,
    public readonly limit: number,
  ) {
    super(`Export too large: ${count} observations exceeds limit of ${limit}`);
    this.name = 'ExportTooLargeError';
  }
}
