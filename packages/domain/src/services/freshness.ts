import type { FreshnessInfo, FreshnessConfig } from '../types/freshness.js';
import { DEFAULT_FRESHNESS_CONFIG } from '../types/freshness.js';

export function determineFreshness(
  lastObservation: Date | null,
  now: Date,
  config: FreshnessConfig = DEFAULT_FRESHNESS_CONFIG,
): FreshnessInfo {
  if (lastObservation === null) {
    return { state: 'unavailable', lastObservation: null, ageSeconds: null };
  }

  const ageSeconds = (now.getTime() - lastObservation.getTime()) / 1000;

  if (ageSeconds < 0) {
    return { state: 'live', lastObservation, ageSeconds: 0 };
  }

  if (ageSeconds <= config.delayedAfterSeconds) {
    return { state: 'live', lastObservation, ageSeconds };
  }

  if (ageSeconds <= config.staleAfterSeconds) {
    return { state: 'delayed', lastObservation, ageSeconds };
  }

  return { state: 'stale', lastObservation, ageSeconds };
}
