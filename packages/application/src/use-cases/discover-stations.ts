import type {
  WeatherDataSource,
  StationRepository,
  SensorRepository,
  WeatherStation,
  StationId,
} from '@weather/domain';
import type { Logger } from '@weather/observability';

export class DiscoverStations {
  constructor(
    private readonly weatherSource: WeatherDataSource,
    private readonly stationRepo: StationRepository,
    private readonly sensorRepo: SensorRepository,
    private readonly logger: Logger,
  ) {}

  async execute(): Promise<WeatherStation[]> {
    this.logger.info('Discovering WeatherLink stations');
    const stations = await this.weatherSource.discoverStations();

    await this.stationRepo.saveMany(stations);
    this.logger.info({ count: stations.length }, 'Stations discovered and saved');

    for (const station of stations) {
      await this.discoverSensors(station.id);
    }

    return stations;
  }

  private async discoverSensors(stationId: StationId): Promise<void> {
    try {
      const sensors = await this.weatherSource.getSensors(stationId);
      await this.sensorRepo.saveMany(sensors);
      this.logger.info(
        { stationId: String(stationId), count: sensors.length },
        'Sensors discovered and saved',
      );
    } catch (error) {
      this.logger.warn(
        { err: error, stationId: String(stationId) },
        'Failed to discover sensors',
      );
    }
  }
}
