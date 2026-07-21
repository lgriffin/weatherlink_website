import type { SensorRepository, Sensor, StationId, SensorId } from '@weather/domain';

export class InMemorySensorRepository implements SensorRepository {
  private sensors = new Map<string, Sensor>();

  async findByStationId(stationId: StationId): Promise<Sensor[]> {
    return Array.from(this.sensors.values()).filter(
      (s) => s.stationId === stationId,
    );
  }

  async findById(id: SensorId): Promise<Sensor | null> {
    return this.sensors.get(String(id)) ?? null;
  }

  async save(sensor: Sensor): Promise<void> {
    this.sensors.set(String(sensor.id), sensor);
  }

  async saveMany(sensorList: Sensor[]): Promise<void> {
    for (const sensor of sensorList) {
      await this.save(sensor);
    }
  }
}
