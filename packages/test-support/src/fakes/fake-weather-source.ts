import type { WeatherDataSource, WeatherStation, Sensor, Observation, StationId } from '@weather/domain';

export class FakeWeatherDataSource implements WeatherDataSource {
  stations: WeatherStation[] = [];
  sensors: Sensor[] = [];
  observations: Observation[] = [];
  shouldThrow: Error | null = null;

  async discoverStations(): Promise<WeatherStation[]> {
    if (this.shouldThrow) throw this.shouldThrow;
    return this.stations;
  }

  async getSensors(_stationId: StationId): Promise<Sensor[]> {
    if (this.shouldThrow) throw this.shouldThrow;
    return this.sensors;
  }

  async getCurrentConditions(_stationId: StationId): Promise<Observation[]> {
    if (this.shouldThrow) throw this.shouldThrow;
    return this.observations;
  }
}
