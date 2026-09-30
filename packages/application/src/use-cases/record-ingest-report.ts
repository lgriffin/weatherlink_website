import type { Clock, IngestKind, IngestReport, IngestReportRepository } from '@weather/domain';

/** Reports kept per kind; older ones are dropped as new ones arrive. */
export const INGEST_REPORTS_KEPT = 50;

/** Store one output pushed from another machine, keeping the latest few per kind. */
export class RecordIngestReport {
  constructor(
    private readonly repo: IngestReportRepository,
    private readonly clock: Clock,
    private readonly keep = INGEST_REPORTS_KEPT,
  ) {}

  async execute(kind: IngestKind, source: string, payload: unknown): Promise<IngestReport> {
    const saved = await this.repo.save({ kind, source, receivedAt: this.clock.now(), payload });
    await this.repo.prune(kind, this.keep);
    return saved;
  }
}
