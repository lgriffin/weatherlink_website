import { INGEST_KINDS } from '@weather/domain';
import type { IngestKind, IngestReport, IngestReportRepository } from '@weather/domain';

export interface IngestOverview {
  /** The newest report of each kind, or null when none has arrived. */
  readonly latest: Record<IngestKind, IngestReport | null>;
  /** The most recent uploads of any kind, newest first, without payloads. */
  readonly recent: Array<Omit<IngestReport, 'payload'>>;
}

export class GetIngestOverview {
  constructor(private readonly repo: IngestReportRepository) {}

  async execute(recentLimit = 20): Promise<IngestOverview> {
    const entries = await Promise.all(INGEST_KINDS.map(async (kind) => [kind, await this.repo.findLatest(kind)] as const));
    const recent = await this.repo.findRecent(recentLimit);
    return {
      latest: Object.fromEntries(entries) as Record<IngestKind, IngestReport | null>,
      recent: recent.map(({ payload: _payload, ...rest }) => rest),
    };
  }
}
