import type {
  WeatherDataSource,
  StationRepository,
  ObservationRepository,
  ApplicationMetrics,
  Clock,
  Observation,
} from '@weather/domain';
import type { Logger } from '@weather/observability';

export class PollCurrentConditions {
  constructor(
    private readonly weatherSource: WeatherDataSource,
    private readonly stationRepo: StationRepository,
    private readonly observationRepo: ObservationRepository,
    private readonly metrics: ApplicationMetrics,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async execute(): Promise<Observation[]> {
    const station = await this.stationRepo.findActive();
    if (!station) {
      this.logger.warn('No active station configured, skipping poll');
      return [];
    }

    const startTime = this.clock.now();
    try {
      const observations = await this.weatherSource.getCurrentConditions(station.id);
      await this.observationRepo.saveMany(observations);

      const durationMs = this.clock.now().getTime() - startTime.getTime();
      this.metrics.observeHistogram('weather_poll_duration_seconds', durationMs / 1000);
      this.metrics.incrementCounter('weather_poll_total', { status: 'success' });

      this.logger.info(
        { stationId: String(station.id), observationCount: observations.length, durationMs },
        'Poll completed',
      );

      return observations;
    } catch (error) {
      this.metrics.incrementCounter('weather_poll_total', { status: 'error' });
      this.logger.error({ err: error, stationId: String(station.id) }, 'Poll failed');
      throw error;
    }
  }
}
