import { eq, and, gte, lt, sql } from 'drizzle-orm';
import type { ArchiveRecordRepository, ArchiveRecord, StationId } from '@weather/domain';
import { stationId, sensorId } from '@weather/domain';
import type { DrizzleDatabase as Database } from '../db.js';
import { archiveRecords } from '../schema/archive-records.js';

const INSERT_BATCH_SIZE = 200;

export class DrizzleArchiveRecordRepository implements ArchiveRecordRepository {
  constructor(private readonly db: Database) {}

  async saveMany(records: ArchiveRecord[]): Promise<void> {
    for (let i = 0; i < records.length; i += INSERT_BATCH_SIZE) {
      const rows = records.slice(i, i + INSERT_BATCH_SIZE).map((r) => ({
        stationId: String(r.stationId),
        sensorId: String(r.sensorId),
        sensorType: r.sensorType,
        timestamp: r.timestamp,
        intervalMinutes: r.intervalMinutes,
        payload: r.payload,
        fetchedAt: r.fetchedAt,
      }));
      await this.db
        .insert(archiveRecords)
        .values(rows)
        .onConflictDoUpdate({
          target: [archiveRecords.stationId, archiveRecords.sensorId, archiveRecords.timestamp],
          set: {
            sensorType: sql`excluded.sensor_type`,
            intervalMinutes: sql`excluded.interval_minutes`,
            payload: sql`excluded.payload`,
            fetchedAt: sql`excluded.fetched_at`,
          },
        });
    }
  }

  async findByStationAndTimeRange(
    targetStationId: StationId,
    from: Date,
    to: Date,
  ): Promise<ArchiveRecord[]> {
    const rows = await this.db
      .select()
      .from(archiveRecords)
      .where(
        and(
          eq(archiveRecords.stationId, String(targetStationId)),
          gte(archiveRecords.timestamp, from),
          lt(archiveRecords.timestamp, to),
        ),
      )
      .orderBy(archiveRecords.timestamp);
    return rows.map((r) => ({
      stationId: stationId(r.stationId),
      sensorId: sensorId(r.sensorId),
      sensorType: r.sensorType,
      timestamp: r.timestamp,
      intervalMinutes: r.intervalMinutes,
      payload: r.payload,
      fetchedAt: r.fetchedAt,
    }));
  }

  async findTimeBounds(
    targetStationId: StationId,
  ): Promise<{ earliest: Date; latest: Date } | null> {
    const rows = await this.db
      .select({
        earliest: sql<number | null>`min(${archiveRecords.timestamp})`,
        latest: sql<number | null>`max(${archiveRecords.timestamp})`,
      })
      .from(archiveRecords)
      .where(eq(archiveRecords.stationId, String(targetStationId)));
    const row = rows[0];
    if (!row || row.earliest === null || row.latest === null) return null;
    return { earliest: new Date(row.earliest * 1000), latest: new Date(row.latest * 1000) };
  }

  async countByStation(targetStationId: StationId): Promise<number> {
    const rows = await this.db
      .select({ n: sql<number>`count(*)` })
      .from(archiveRecords)
      .where(eq(archiveRecords.stationId, String(targetStationId)));
    return rows[0]?.n ?? 0;
  }
}
