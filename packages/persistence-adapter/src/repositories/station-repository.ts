import { eq } from 'drizzle-orm';
import type { StationRepository, WeatherStation, StationId } from '@weather/domain';
import { stationId } from '@weather/domain';
import type { Database } from '../db.js';
import { stations } from '../schema/stations.js';

export class DrizzleStationRepository implements StationRepository {
  constructor(private readonly db: Database) {}

  async findById(id: StationId): Promise<WeatherStation | null> {
    const rows = await this.db.select().from(stations).where(eq(stations.id, id));
    const row = rows[0];
    return row ? this.toDomain(row) : null;
  }

  async findActive(): Promise<WeatherStation | null> {
    const rows = await this.db
      .select()
      .from(stations)
      .where(eq(stations.isActive, true))
      .limit(1);
    const row = rows[0];
    return row ? this.toDomain(row) : null;
  }

  async findAll(): Promise<WeatherStation[]> {
    const rows = await this.db.select().from(stations);
    return rows.map((r) => this.toDomain(r));
  }

  async save(station: WeatherStation): Promise<void> {
    await this.db
      .insert(stations)
      .values(this.toRow(station))
      .onConflictDoUpdate({
        target: stations.id,
        set: {
          name: station.name,
          timezone: station.timezone,
          latitude: station.latitude,
          longitude: station.longitude,
          elevationMetres: station.elevationMetres,
          isActive: station.isActive,
          updatedAt: station.updatedAt,
        },
      });
  }

  async saveMany(stationList: WeatherStation[]): Promise<void> {
    for (const station of stationList) {
      await this.save(station);
    }
  }

  private toDomain(row: typeof stations.$inferSelect): WeatherStation {
    return {
      id: stationId(row.id),
      weatherLinkStationId: Number(row.weatherLinkStationId),
      name: row.name,
      timezone: row.timezone,
      latitude: row.latitude,
      longitude: row.longitude,
      elevationMetres: row.elevationMetres,
      isActive: row.isActive,
      registeredAt: row.registeredAt,
      updatedAt: row.updatedAt,
    };
  }

  private toRow(station: WeatherStation) {
    return {
      id: String(station.id),
      weatherLinkStationId: String(station.weatherLinkStationId),
      name: station.name,
      timezone: station.timezone,
      latitude: station.latitude,
      longitude: station.longitude,
      elevationMetres: station.elevationMetres,
      isActive: station.isActive,
      registeredAt: station.registeredAt,
      updatedAt: station.updatedAt,
    };
  }
}
