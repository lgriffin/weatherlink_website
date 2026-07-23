import { eq, and, gte, lte, lt, like, sql } from 'drizzle-orm';
import type {
  DailySummaryRepository,
  DailySummary,
  StationId,
  MeasurementName,
  CanonicalUnit,
} from '@weather/domain';
import { stationId } from '@weather/domain';
import type { DrizzleDatabase as Database } from '../db.js';
import { dailySummaries } from '../schema/daily-summaries.js';

export class DrizzleDailySummaryRepository implements DailySummaryRepository {
  constructor(private readonly db: Database) {}

  async findByStationAndDate(
    targetStationId: StationId,
    date: string,
  ): Promise<DailySummary[]> {
    const rows = await this.db
      .select()
      .from(dailySummaries)
      .where(
        and(
          eq(dailySummaries.stationId, String(targetStationId)),
          eq(dailySummaries.date, date),
        ),
      );
    return rows.map((r) => this.toDomain(r));
  }

  async findByStationAndDateRange(
    targetStationId: StationId,
    fromDate: string,
    toDate: string,
  ): Promise<DailySummary[]> {
    const rows = await this.db
      .select()
      .from(dailySummaries)
      .where(
        and(
          eq(dailySummaries.stationId, String(targetStationId)),
          gte(dailySummaries.date, fromDate),
          lte(dailySummaries.date, toDate),
        ),
      );
    return rows.map((r) => this.toDomain(r));
  }

  async findByStationDateAndMeasurement(
    targetStationId: StationId,
    monthDay: string,
    measurementName: MeasurementName,
  ): Promise<DailySummary[]> {
    const rows = await this.db
      .select()
      .from(dailySummaries)
      .where(
        and(
          eq(dailySummaries.stationId, String(targetStationId)),
          like(dailySummaries.date, `%-${monthDay}`),
          eq(dailySummaries.measurementName, measurementName),
        ),
      );
    return rows.map((r) => this.toDomain(r));
  }

  async save(summary: DailySummary): Promise<void> {
    await this.db
      .insert(dailySummaries)
      .values(this.toRow(summary))
      .onConflictDoUpdate({
        target: [dailySummaries.stationId, dailySummaries.date, dailySummaries.measurementName],
        set: {
          min: sql`excluded.min`,
          max: sql`excluded.max`,
          avg: sql`excluded.avg`,
          count: sql`excluded.count`,
        },
      });
  }

  async saveMany(summaries: DailySummary[]): Promise<void> {
    if (summaries.length === 0) return;
    for (const summary of summaries) {
      await this.save(summary);
    }
  }

  async deleteOlderThan(cutoff: string): Promise<number> {
    const result = await this.db
      .delete(dailySummaries)
      .where(lt(dailySummaries.date, cutoff))
      .returning({ id: dailySummaries.id });
    return result.length;
  }

  private toDomain(row: typeof dailySummaries.$inferSelect): DailySummary {
    return {
      stationId: stationId(row.stationId),
      date: row.date,
      measurementName: row.measurementName as MeasurementName,
      unit: row.unit as CanonicalUnit,
      min: row.min,
      max: row.max,
      avg: row.avg,
      count: row.count,
    };
  }

  private toRow(summary: DailySummary) {
    return {
      stationId: String(summary.stationId),
      date: summary.date,
      measurementName: summary.measurementName,
      unit: summary.unit,
      min: summary.min,
      max: summary.max,
      avg: summary.avg,
      count: summary.count,
    };
  }
}
