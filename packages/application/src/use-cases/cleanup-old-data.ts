import type {
  ObservationRepository,
  DailySummaryRepository,
  RetentionPolicy,
  Clock,
} from '@weather/domain';
import type { Logger } from '@weather/observability';

const MS_PER_DAY = 86400000;

export class CleanupOldData {
  constructor(
    private readonly observationRepo: ObservationRepository,
    private readonly dailySummaryRepo: DailySummaryRepository,
    private readonly policy: RetentionPolicy,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async execute(): Promise<void> {
    const now = this.clock.now();
    let obsDeleted = 0;
    let summariesDeleted = 0;

    // A max age of 0 keeps data forever.
    if (this.policy.observationMaxAgeDays > 0) {
      const obsCutoff = new Date(now.getTime() - this.policy.observationMaxAgeDays * MS_PER_DAY);
      obsDeleted = await this.observationRepo.deleteOlderThan(obsCutoff);
    }

    if (this.policy.summaryMaxAgeDays > 0) {
      const summaryCutoff = new Date(now.getTime() - this.policy.summaryMaxAgeDays * MS_PER_DAY);
      const summaryCutoffStr = summaryCutoff.toISOString().substring(0, 10);
      summariesDeleted = await this.dailySummaryRepo.deleteOlderThan(summaryCutoffStr);
    }

    if (obsDeleted > 0 || summariesDeleted > 0) {
      this.logger.info(
        { observationsDeleted: obsDeleted, summariesDeleted },
        'Data cleanup completed',
      );
    }
  }
}
