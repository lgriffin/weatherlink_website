import { addDays } from '@weather/domain';

/**
 * Local calendar dates that may hold data, given the UTC dates that do.
 * A UTC date overlaps the local date before or after it in any time zone,
 * so each one contributes itself and its neighbours. Days with no data are
 * skipped later by the summary computation.
 */
export function localDateCandidates(utcDates: readonly string[], beforeDate: string): string[] {
  const candidates = new Set<string>();
  for (const d of utcDates) {
    candidates.add(addDays(d, -1));
    candidates.add(d);
    candidates.add(addDays(d, 1));
  }
  return [...candidates].filter((d) => d < beforeDate).sort();
}
