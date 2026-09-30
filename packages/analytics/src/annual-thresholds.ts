import type { DailySummary } from '@weather/domain';

/**
 * Days per month past each threshold, for each year: warm days (high at or
 * above 20 °C, 21 °C, ... up to the station's record high), cold days (low at
 * or below 5 °C, 4 °C, ... down to the record low) and wet days (2 mm, 5 mm,
 * ... up to the wettest day). Only complete days count, so an outage never
 * reads as a day that wasn't warm.
 */

export type ThresholdGroupKey = 'warm' | 'cold' | 'wet';

export interface ThresholdRow {
  readonly threshold: number;
  /** Per year: count for each month (null when the month has no complete days yet) and the year's total. */
  readonly byYear: Record<string, { months: (number | null)[]; total: number }>;
}

export interface ThresholdGroup {
  readonly key: ThresholdGroupKey;
  readonly rows: ThresholdRow[];
}

export interface YearCoverage {
  readonly year: string;
  /** Complete days in each month. */
  readonly completeDays: number[];
  /** Days in each month up to `asOf` (0 for months still to come). */
  readonly elapsedDays: number[];
}

export interface AnnualThresholds {
  readonly years: string[];
  readonly coverage: YearCoverage[];
  readonly groups: ThresholdGroup[];
}

export const WARM_FROM_C = 20;
export const COLD_FROM_C = 5;
export const WET_THRESHOLDS_MM = [2, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100];

interface DayValues {
  high: number | null;
  low: number | null;
  rain: number | null;
}

function elapsedDaysInMonth(year: number, month: number, asOf: string): number {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  if (first > asOf) return 0;
  const last = `${year}-${String(month).padStart(2, '0')}-${String(days).padStart(2, '0')}`;
  return last <= asOf ? days : Number(asOf.substring(8, 10));
}

export function annualThresholds(
  summaries: readonly DailySummary[],
  complete: ReadonlySet<string>,
  years: readonly string[],
  asOf: string,
): AnnualThresholds {
  const days = new Map<string, DayValues>();
  const day = (date: string) => {
    let d = days.get(date);
    if (!d) days.set(date, (d = { high: null, low: null, rain: null }));
    return d;
  };

  // Record extremes come from every complete day, not just the years shown.
  let recordHigh = -Infinity;
  let recordLow = Infinity;
  let wettest = 0;
  for (const s of summaries) {
    if (!complete.has(s.date)) continue;
    if (s.measurementName === 'temperature.outdoor') {
      day(s.date).high = s.max;
      day(s.date).low = s.min;
      if (s.max !== null) recordHigh = Math.max(recordHigh, s.max);
      if (s.min !== null) recordLow = Math.min(recordLow, s.min);
    } else if (s.measurementName === 'rain.daily') {
      day(s.date).rain = s.max;
      if (s.max !== null) wettest = Math.max(wettest, s.max);
    }
  }

  const range = (from: number, to: number, step: number) => {
    const out: number[] = [];
    for (let t = from; step > 0 ? t <= to : t >= to; t += step) out.push(t);
    return out;
  };
  const warm = range(WARM_FROM_C, Math.max(WARM_FROM_C, Math.floor(recordHigh)), 1);
  const cold = range(COLD_FROM_C, Math.min(COLD_FROM_C, Math.ceil(recordLow)), -1);
  const wetLimit = WET_THRESHOLDS_MM.findIndex((t) => t > wettest);
  const wet = WET_THRESHOLDS_MM.slice(0, Math.max(1, wetLimit === -1 ? WET_THRESHOLDS_MM.length : wetLimit));

  const coverage: YearCoverage[] = years.map((year) => {
    const completeDays = new Array<number>(12).fill(0);
    for (const date of complete) {
      if (date.startsWith(`${year}-`) && date <= asOf) completeDays[Number(date.substring(5, 7)) - 1]!++;
    }
    return {
      year,
      completeDays,
      elapsedDays: completeDays.map((_, m) => elapsedDaysInMonth(Number(year), m + 1, asOf)),
    };
  });

  function rows(thresholds: number[], passes: (d: DayValues, t: number) => boolean): ThresholdRow[] {
    return thresholds.map((threshold) => {
      const byYear: ThresholdRow['byYear'] = {};
      for (const cov of coverage) {
        const months = cov.completeDays.map((n) => (n > 0 ? 0 : null)) as (number | null)[];
        for (const [date, values] of days) {
          if (!date.startsWith(`${cov.year}-`) || date > asOf) continue;
          if (passes(values, threshold)) {
            const m = Number(date.substring(5, 7)) - 1;
            months[m] = (months[m] ?? 0) + 1;
          }
        }
        byYear[cov.year] = { months, total: months.reduce<number>((a, n) => a + (n ?? 0), 0) };
      }
      return { threshold, byYear };
    });
  }

  return {
    years: [...years],
    coverage,
    groups: [
      { key: 'warm', rows: rows(warm, (d, t) => d.high !== null && d.high >= t) },
      { key: 'cold', rows: rows(cold, (d, t) => d.low !== null && d.low <= t) },
      { key: 'wet', rows: rows(wet, (d, t) => d.rain !== null && d.rain >= t) },
    ],
  };
}
