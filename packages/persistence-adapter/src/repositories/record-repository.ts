import { eq, and } from 'drizzle-orm';
import type {
  RecordRepository,
  WeatherRecord,
  StationId,
  MeasurementName,
  RecordScope,
  RecordType,
  CanonicalUnit,
} from '@weather/domain';
import { stationId } from '@weather/domain';
import type { DrizzleDatabase as Database } from '../db.js';
import { records } from '../schema/records.js';

export class DrizzleRecordRepository implements RecordRepository {
  constructor(private readonly db: Database) {}

  async findByStation(
    targetStationId: StationId,
    scope?: RecordScope,
  ): Promise<WeatherRecord[]> {
    const conditions = [eq(records.stationId, String(targetStationId))];
    if (scope) {
      conditions.push(eq(records.scope, scope));
    }
    const rows = await this.db
      .select()
      .from(records)
      .where(and(...conditions));
    return rows.map((r) => this.toDomain(r));
  }

  async findByStationAndMeasurement(
    targetStationId: StationId,
    measurementName: MeasurementName,
  ): Promise<WeatherRecord[]> {
    const rows = await this.db
      .select()
      .from(records)
      .where(
        and(
          eq(records.stationId, String(targetStationId)),
          eq(records.measurementName, measurementName),
        ),
      );
    return rows.map((r) => this.toDomain(r));
  }

  async save(record: WeatherRecord): Promise<void> {
    await this.db.insert(records).values(this.toRow(record));
  }

  async saveMany(recordList: WeatherRecord[]): Promise<void> {
    if (recordList.length === 0) return;
    await this.db.insert(records).values(recordList.map((r) => this.toRow(r)));
  }

  async deleteByStation(targetStationId: StationId): Promise<void> {
    await this.db
      .delete(records)
      .where(eq(records.stationId, String(targetStationId)));
  }

  private toDomain(row: typeof records.$inferSelect): WeatherRecord {
    return {
      stationId: stationId(row.stationId),
      measurementName: row.measurementName as MeasurementName,
      unit: row.unit as CanonicalUnit,
      scope: row.scope as RecordScope,
      scopeKey: row.scopeKey,
      recordType: row.recordType as RecordType,
      value: row.value,
      date: row.date,
      description: row.description ?? undefined,
    };
  }

  private toRow(record: WeatherRecord) {
    return {
      stationId: String(record.stationId),
      measurementName: record.measurementName,
      unit: record.unit,
      scope: record.scope,
      scopeKey: record.scopeKey,
      recordType: record.recordType,
      value: record.value,
      date: record.date,
      description: record.description ?? null,
    };
  }
}
