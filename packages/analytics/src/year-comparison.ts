import type { DailySummary } from '@weather/domain';

/** Rain below this counts as a dry day (one tip of a 0.2 mm gauge). */
export const WET_DAY_MM = 0.2;

const COVERAGE_MEASUREMENT = 'temperature.outdoor';

function byMeasurement(summaries: readonly DailySummary[], name: string): Map<string, DailySummary> {
  const map = new Map<string, DailySummary>();
  for (const s of summaries) {
    if (s.measurementName === name) map.set(s.date, s);
  }
  return map;
}

function nextDate(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().substring(0, 10);
}

/**
 * Dates with enough outdoor readings to trust. A day is complete when its
 * temperature summary has at least `threshold` of the station's usual daily
 * reading count (the most common count, so the archive interval doesn't matter).
 */
export function completeDates(summaries: readonly DailySummary[], threshold = 0.9): Set<string> {
  const temps = [...byMeasurement(summaries, COVERAGE_MEASUREMENT).values()];
  const frequency = new Map<number, number>();
  for (const s of temps) frequency.set(s.count, (frequency.get(s.count) ?? 0) + 1);

  let typical = 0;
  let best = 0;
  for (const [count, n] of frequency) {
    if (n > best || (n === best && count > typical)) {
      typical = count;
      best = n;
    }
  }

  const complete = new Set<string>();
  for (const s of temps) {
    if (s.count >= typical * threshold) complete.add(s.date);
  }
  return complete;
}

export interface RunningTotalPoint {
  /** MM-DD, so years line up on one axis. */
  readonly monthDay: string;
  readonly total: number;
}

export interface YearRunningTotal {
  readonly year: string;
  /** First date counted: 1 January, or the first day with data in the station's first year. */
  readonly startDate: string;
  readonly points: RunningTotalPoint[];
  readonly final: number;
  /** Days in the year so far with no complete data, whose amounts are missing from the total. */
  readonly incompleteDays: number;
}

/**
 * Cumulative total through each year for a measurement whose daily total is
 * stored as the summary max (rain, degree days, ET, wind run).
 */
export function runningTotals(
  summaries: readonly DailySummary[],
  measurement: string,
  complete: ReadonlySet<string>,
  lastDate: string,
): YearRunningTotal[] {
  const daily = byMeasurement(summaries, measurement);
  const dates = [...daily.keys()].sort();
  const firstDate = dates[0];
  if (!firstDate) return [];
  const years = [...new Set(dates.map((d) => d.substring(0, 4)))];

  return years.map((year) => {
    const points: RunningTotalPoint[] = [];
    let total = 0;
    let incompleteDays = 0;
    const start = `${year}-01-01` < firstDate ? firstDate : `${year}-01-01`;
    const end = `${year}-12-31` < lastDate ? `${year}-12-31` : lastDate;

    for (let date = start; date <= end; date = nextDate(date)) {
      const s = daily.get(date);
      if (s?.max != null) total += s.max;
      if (!complete.has(date)) incompleteDays++;
      points.push({ monthDay: date.substring(5), total: Math.round(total * 10) / 10 });
    }

    return { year, startDate: start, points, final: Math.round(total * 10) / 10, incompleteDays };
  });
}

export interface MonthScore {
  readonly year: string;
  readonly meanTemp: number | null;
  readonly maxTemp: number | null;
  readonly minTemp: number | null;
  readonly rainTotal: number | null;
  readonly wetDays: number;
  readonly frostDays: number;
  readonly peakGust: number | null;
  readonly completeDays: number;
  readonly daysInMonth: number;
}

function round1(v: number | null): number | null {
  return v === null ? null : Math.round(v * 10) / 10;
}

/** One row per year for the same calendar month (1–12), using complete days only. */
export function monthScorecards(
  summaries: readonly DailySummary[],
  month: number,
  complete: ReadonlySet<string>,
): MonthScore[] {
  const mm = String(month).padStart(2, '0');
  const inMonth = summaries.filter((s) => s.date.substring(5, 7) === mm && complete.has(s.date));
  const years = [...new Set(summaries.filter((s) => s.date.substring(5, 7) === mm).map((s) => s.date.substring(0, 4)))].sort();

  return years.map((year) => {
    const rows = inMonth.filter((s) => s.date.startsWith(`${year}-`));
    const temps = rows.filter((s) => s.measurementName === 'temperature.outdoor');
    const rain = rows.filter((s) => s.measurementName === 'rain.daily' && s.max !== null);
    const gusts = rows.filter((s) => s.measurementName === 'wind.gust' && s.max !== null);
    const avgs = temps.map((s) => s.avg).filter((v): v is number => v !== null);
    const maxes = temps.map((s) => s.max).filter((v): v is number => v !== null);
    const mins = temps.map((s) => s.min).filter((v): v is number => v !== null);

    return {
      year,
      meanTemp: round1(avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null),
      maxTemp: round1(maxes.length ? Math.max(...maxes) : null),
      minTemp: round1(mins.length ? Math.min(...mins) : null),
      rainTotal: round1(rain.length ? rain.reduce((a, s) => a + s.max!, 0) : null),
      wetDays: rain.filter((s) => s.max! >= WET_DAY_MM).length,
      frostDays: mins.filter((v) => v <= 0).length,
      peakGust: round1(gusts.length ? Math.max(...gusts.map((s) => s.max!)) : null),
      completeDays: new Set(temps.map((s) => s.date)).size,
      daysInMonth: new Date(Date.UTC(Number(year), month, 0)).getUTCDate(),
    };
  });
}

export type RunKind = 'dry' | 'wet' | 'frost' | 'warm';

export interface WeatherRun {
  readonly kind: RunKind;
  /** Length of the run that includes the latest complete day (0 if it doesn't match). */
  readonly current: number;
  readonly currentStart: string | null;
  readonly longest: number;
  readonly longestEnd: string | null;
}

const RUN_TESTS: Record<RunKind, { measurement: string; test: (s: DailySummary) => boolean }> = {
  dry: { measurement: 'rain.daily', test: (s) => s.max !== null && s.max < WET_DAY_MM },
  wet: { measurement: 'rain.daily', test: (s) => s.max !== null && s.max >= WET_DAY_MM },
  frost: { measurement: 'temperature.outdoor', test: (s) => s.min !== null && s.min <= 0 },
  warm: { measurement: 'temperature.outdoor', test: (s) => s.max !== null && s.max >= 20 },
};

/**
 * Current and longest runs of consecutive complete days. A missing or
 * incomplete day ends a run, so outages never join two runs together.
 */
export function weatherRuns(
  summaries: readonly DailySummary[],
  complete: ReadonlySet<string>,
): WeatherRun[] {
  return (Object.keys(RUN_TESTS) as RunKind[]).map((kind) => {
    const { measurement, test } = RUN_TESTS[kind];
    const days = [...byMeasurement(summaries, measurement).values()]
      .filter((s) => complete.has(s.date))
      .sort((a, b) => a.date.localeCompare(b.date));

    let length = 0;
    let start: string | null = null;
    let previous = '';
    let longest = 0;
    let longestEnd: string | null = null;

    for (const s of days) {
      if (length > 0 && s.date !== nextDate(previous)) length = 0;
      previous = s.date;
      if (test(s)) {
        if (length === 0) start = s.date;
        length++;
        if (length > longest) {
          longest = length;
          longestEnd = s.date;
        }
      } else {
        length = 0;
      }
    }

    return {
      kind,
      current: length,
      currentStart: length > 0 ? start : null,
      longest,
      longestEnd,
    };
  });
}
