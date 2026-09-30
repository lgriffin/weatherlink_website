import type { IngestKind, IngestReport, IngestReportRepository, NewIngestReport } from '@weather/domain';

export class InMemoryIngestReportRepository implements IngestReportRepository {
  private reports: IngestReport[] = [];
  private nextId = 1;

  async save(report: NewIngestReport): Promise<IngestReport> {
    const saved = { ...report, id: this.nextId++ };
    this.reports.push(saved);
    return saved;
  }

  private newestFirst(kind?: IngestKind): IngestReport[] {
    return this.reports
      .filter((r) => kind === undefined || r.kind === kind)
      .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime() || b.id - a.id);
  }

  async findLatest(kind: IngestKind): Promise<IngestReport | null> {
    return this.newestFirst(kind)[0] ?? null;
  }

  async findRecent(limit: number): Promise<IngestReport[]> {
    return this.newestFirst().slice(0, limit);
  }

  async prune(kind: IngestKind, keep: number): Promise<number> {
    const kept = new Set(this.newestFirst(kind).slice(0, keep).map((r) => r.id));
    const before = this.reports.length;
    this.reports = this.reports.filter((r) => r.kind !== kind || kept.has(r.id));
    return before - this.reports.length;
  }

  getAll(): IngestReport[] {
    return [...this.reports];
  }
}
