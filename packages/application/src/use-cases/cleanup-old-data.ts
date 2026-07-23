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

    const obsCutoff = new Date(now.getTime() - this.policy.observationMaxAgeDays * MS_PER_DAY);
    const obsDeleted = await this.observationRepo.deleteOlderThan(obsCutoff);

    const summaryCutoff = new Date(now.getTime() - this.policy.summaryMaxAgeDays * MS_PER_DAY);
    const summaryCutoffStr = summaryCutoff.toISOString().substring(0, 10);
    const summariesDeleted = await this.dailySummaryRepo.deleteOlderThan(summaryCutoffStr);

    if (obsDeleted > 0 || summariesDeleted > 0) {
      this.logger.info(
        { observationsDeleted: obsDeleted, summariesDeleted },
        'Data cleanup completed',
      );
    }
  }
}
