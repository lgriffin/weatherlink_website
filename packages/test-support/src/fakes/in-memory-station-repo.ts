import type { StationRepository, WeatherStation, StationId } from '@weather/domain';

export class InMemoryStationRepository implements StationRepository {
  private stations = new Map<string, WeatherStation>();

  async findById(id: StationId): Promise<WeatherStation | null> {
    return this.stations.get(String(id)) ?? null;
  }

  async findActive(): Promise<WeatherStation | null> {
    for (const station of this.stations.values()) {
      if (station.isActive) return station;
    }
    return null;
  }

  async findAll(): Promise<WeatherStation[]> {
    return Array.from(this.stations.values());
  }

  async save(station: WeatherStation): Promise<void> {
    this.stations.set(String(station.id), station);
  }

  async saveMany(stationList: WeatherStation[]): Promise<void> {
    for (const station of stationList) {
      await this.save(station);
    }
  }
}
