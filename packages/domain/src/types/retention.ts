export interface RetentionPolicy {
  readonly observationMaxAgeDays: number;
  readonly summaryMaxAgeDays: number;
}

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  observationMaxAgeDays: 365,
  summaryMaxAgeDays: 3650,
};
