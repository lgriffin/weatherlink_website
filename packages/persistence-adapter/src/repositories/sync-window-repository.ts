import { eq, and, lte, gte, asc } from 'drizzle-orm';
import type {
  SyncWindowRepository,
  SyncWindow,
  StationId,
  SensorId,
} from '@weather/domain';
import { stationId, sensorId } from '@weather/domain';
import type { DrizzleDatabase as Database } from '../db.js';
import { syncWindows } from '../schema/sync-windows.js';

export class DrizzleSyncWindowRepository implements SyncWindowRepository {
  constructor(private readonly db: Database) {}

  async findByStationAndSensor(
    targetStationId: StationId,
    targetSensorId: SensorId,
  ): Promise<SyncWindow[]> {
    const rows = await this.db
      .select()
      .from(syncWindows)
      .where(
        and(
          eq(syncWindows.stationId, String(targetStationId)),
          eq(syncWindows.sensorId, String(targetSensorId)),
        ),
      )
      .orderBy(asc(syncWindows.startTimestamp));
    return rows.map((r) => this.toDomain(r));
  }

  async findGaps(
    targetStationId: StationId,
    targetSensorId: SensorId,
    from: Date,
    to: Date,
  ): Promise<Array<{ from: Date; to: Date }>> {
    const windows = await this.db
      .select()
      .from(syncWindows)
      .where(
        and(
          eq(syncWindows.stationId, String(targetStationId)),
          eq(syncWindows.sensorId, String(targetSensorId)),
          gte(syncWindows.endTimestamp, from),
          lte(syncWindows.startTimestamp, to),
        ),
      )
      .orderBy(asc(syncWindows.startTimestamp));

    const gaps: Array<{ from: Date; to: Date }> = [];
    let cursor = from;

    for (const w of windows) {
      if (w.startTimestamp > cursor) {
        gaps.push({ from: cursor, to: w.startTimestamp });
      }
      if (w.endTimestamp > cursor) {
        cursor = w.endTimestamp;
      }
    }

    if (cursor < to) {
      gaps.push({ from: cursor, to });
    }

    return gaps;
  }

  async save(syncWindow: SyncWindow): Promise<void> {
    await this.db.insert(syncWindows).values({
      stationId: String(syncWindow.stationId),
      sensorId: String(syncWindow.sensorId),
      startTimestamp: syncWindow.startTimestamp,
      endTimestamp: syncWindow.endTimestamp,
      syncedAt: syncWindow.syncedAt,
      observationCount: syncWindow.observationCount,
    });
  }

  private toDomain(row: typeof syncWindows.$inferSelect): SyncWindow {
    return {
      stationId: stationId(row.stationId),
      sensorId: sensorId(row.sensorId),
      startTimestamp: row.startTimestamp,
      endTimestamp: row.endTimestamp,
      syncedAt: row.syncedAt,
      observationCount: row.observationCount,
    };
  }
}
