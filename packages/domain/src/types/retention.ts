/** A max age of 0 days means "keep forever". */
export interface RetentionPolicy {
  readonly observationMaxAgeDays: number;
  readonly summaryMaxAgeDays: number;
}

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  observationMaxAgeDays: 0,
  summaryMaxAgeDays: 0,
};
