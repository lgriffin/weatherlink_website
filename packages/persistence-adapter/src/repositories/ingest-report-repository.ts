import { eq, desc, and, notInArray } from 'drizzle-orm';
import type { IngestKind, IngestReport, IngestReportRepository, NewIngestReport } from '@weather/domain';
import type { DrizzleDatabase as Database } from '../db.js';
import { ingestReports } from '../schema/ingest-reports.js';

type Row = typeof ingestReports.$inferSelect;

function toReport(row: Row): IngestReport {
  return {
    id: row.id,
    kind: row.kind as IngestKind,
    source: row.source,
    receivedAt: row.receivedAt,
    payload: row.payload,
  };
}

export class DrizzleIngestReportRepository implements IngestReportRepository {
  constructor(private readonly db: Database) {}

  async save(report: NewIngestReport): Promise<IngestReport> {
    const [row] = await this.db
      .insert(ingestReports)
      .values({ kind: report.kind, source: report.source, receivedAt: report.receivedAt, payload: report.payload })
      .returning();
    return toReport(row!);
  }

  async findLatest(kind: IngestKind): Promise<IngestReport | null> {
    const [row] = await this.db
      .select()
      .from(ingestReports)
      .where(eq(ingestReports.kind, kind))
      .orderBy(desc(ingestReports.receivedAt), desc(ingestReports.id))
      .limit(1);
    return row ? toReport(row) : null;
  }

  async findRecent(limit: number): Promise<IngestReport[]> {
    const rows = await this.db
      .select()
      .from(ingestReports)
      .orderBy(desc(ingestReports.receivedAt), desc(ingestReports.id))
      .limit(limit);
    return rows.map(toReport);
  }

  async prune(kind: IngestKind, keep: number): Promise<number> {
    const kept = this.db
      .select({ id: ingestReports.id })
      .from(ingestReports)
      .where(eq(ingestReports.kind, kind))
      .orderBy(desc(ingestReports.receivedAt), desc(ingestReports.id))
      .limit(keep);
    const removed = await this.db
      .delete(ingestReports)
      .where(and(eq(ingestReports.kind, kind), notInArray(ingestReports.id, kept)))
      .returning({ id: ingestReports.id });
    return removed.length;
  }
}
