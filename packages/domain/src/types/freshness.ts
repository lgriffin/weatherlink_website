export type FreshnessState = 'live' | 'delayed' | 'stale' | 'unavailable';

export interface FreshnessConfig {
  readonly delayedAfterSeconds: number;
  readonly staleAfterSeconds: number;
}

export const DEFAULT_FRESHNESS_CONFIG: FreshnessConfig = {
  delayedAfterSeconds: 300,
  staleAfterSeconds: 900,
};

export interface FreshnessInfo {
  readonly state: FreshnessState;
  readonly lastObservation: Date | null;
  readonly ageSeconds: number | null;
}
