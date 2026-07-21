import { eq } from 'drizzle-orm';
import type { SensorRepository, Sensor, StationId, SensorId, SensorCategory } from '@weather/domain';
import { sensorId } from '@weather/domain';
import type { Database } from '../db.js';
import { sensors } from '../schema/sensors.js';

export class DrizzleSensorRepository implements SensorRepository {
  constructor(private readonly db: Database) {}

  async findByStationId(stationId: StationId): Promise<Sensor[]> {
    const rows = await this.db
      .select()
      .from(sensors)
      .where(eq(sensors.stationId, String(stationId)));
    return rows.map((r) => this.toDomain(r));
  }

  async findById(id: SensorId): Promise<Sensor | null> {
    const rows = await this.db.select().from(sensors).where(eq(sensors.id, String(id)));
    const row = rows[0];
    return row ? this.toDomain(row) : null;
  }

  async save(sensor: Sensor): Promise<void> {
    await this.db
      .insert(sensors)
      .values(this.toRow(sensor))
      .onConflictDoUpdate({
        target: sensors.id,
        set: {
          name: sensor.name,
          category: sensor.category,
          isActive: sensor.isActive,
        },
      });
  }

  async saveMany(sensorList: Sensor[]): Promise<void> {
    for (const sensor of sensorList) {
      await this.save(sensor);
    }
  }

  private toDomain(row: typeof sensors.$inferSelect): Sensor {
    return {
      id: sensorId(row.id),
      stationId: row.stationId as StationId,
      lsid: row.lsid,
      sensorType: row.sensorType,
      dataStructureType: row.dataStructureType,
      name: row.name,
      category: row.category as SensorCategory,
      capabilities: [],
      isActive: row.isActive,
    };
  }

  private toRow(sensor: Sensor) {
    return {
      id: String(sensor.id),
      stationId: String(sensor.stationId),
      lsid: sensor.lsid,
      sensorType: sensor.sensorType,
      dataStructureType: sensor.dataStructureType,
      name: sensor.name,
      category: sensor.category,
      isActive: sensor.isActive,
    };
  }
}
