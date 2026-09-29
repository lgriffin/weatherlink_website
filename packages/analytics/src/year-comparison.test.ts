import { describe, it, expect } from 'vitest';
import { completeDates, runningTotals, monthScorecards, weatherRuns } from './year-comparison.js';
import { aDailySummary } from '@weather/test-support';
import type { DailySummary, MeasurementName, CanonicalUnit } from '@weather/domain';

function temp(date: string, min: number, max: number, count = 96): DailySummary {
  return aDailySummary({ date, measurementName: 'temperature.outdoor' as MeasurementName, min, max, avg: (min + max) / 2, count });
}
function rain(date: string, total: number): DailySummary {
  return aDailySummary({ date, measurementName: 'rain.daily' as MeasurementName, unit: 'mm' as CanonicalUnit, min: null, max: total, avg: null, count: 96 });
}
function gust(date: string, max: number): DailySummary {
  return aDailySummary({ date, measurementName: 'wind.gust' as MeasurementName, unit: 'm/s' as CanonicalUnit, min: 0, max, avg: 3, count: 96 });
}

describe('completeDates', () => {
  it('marks days with far fewer readings than usual as incomplete', () => {
    const s = [temp('2025-01-01', 1, 5), temp('2025-01-02', 1, 5), temp('2025-01-03', 1, 5, 40)];
    expect([...completeDates(s)].sort()).toEqual(['2025-01-01', '2025-01-02']);
  });
});

describe('runningTotals', () => {
  it('starts the first year at the first day with data', () => {
    const s = [temp('2023-06-01', 1, 5), rain('2023-06-01', 2), temp('2024-01-01', 1, 5), rain('2024-01-01', 1)];
    const [y2023] = runningTotals(s, 'rain.daily', completeDates(s), '2024-01-01');
    expect(y2023!.startDate).toBe('2023-06-01');
    expect(y2023!.points[0]!.monthDay).toBe('06-01');
    expect(y2023!.points).toHaveLength(214);
    expect(y2023!.incompleteDays).toBe(213);
  });

  it('accumulates each year separately and counts incomplete days', () => {
    const s = [
      temp('2025-01-01', 1, 5), rain('2025-01-01', 2),
      temp('2025-01-02', 1, 5), rain('2025-01-02', 3.5),
      rain('2026-01-01', 1), temp('2026-01-01', 1, 5),
    ];
    const totals = runningTotals(s, 'rain.daily', completeDates(s), '2026-01-02');
    expect(totals.map((t) => t.year)).toEqual(['2025', '2026']);
    const y2025 = totals[0]!;
    expect(y2025.points[0]).toEqual({ monthDay: '01-01', total: 2 });
    expect(y2025.points[1]).toEqual({ monthDay: '01-02', total: 5.5 });
    expect(y2025.points).toHaveLength(365);
    expect(y2025.incompleteDays).toBe(363);
    const y2026 = totals[1]!;
    expect(y2026.points).toHaveLength(2);
    expect(y2026.final).toBe(1);
  });
});

describe('monthScorecards', () => {
  it('scores the same month in each year from complete days', () => {
    const s = [
      temp('2025-09-01', 8, 18), rain('2025-09-01', 4), gust('2025-09-01', 15),
      temp('2025-09-02', -1, 12), rain('2025-09-02', 0),
      temp('2026-09-01', 10, 22), rain('2026-09-01', 0.2),
      temp('2026-09-02', 9, 30, 10), rain('2026-09-02', 50), // outage day, ignored
    ];
    const cards = monthScorecards(s, 9, completeDates(s));
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({
      year: '2025', meanTemp: 9.3, maxTemp: 18, minTemp: -1, rainTotal: 4,
      wetDays: 1, frostDays: 1, peakGust: 15, completeDays: 2, daysInMonth: 30,
    });
    expect(cards[1]).toMatchObject({ year: '2026', maxTemp: 22, rainTotal: 0.2, wetDays: 1, completeDays: 1 });
  });
});

describe('weatherRuns', () => {
  it('reports the current dry run and the longest one, broken by outages', () => {
    const s = [
      temp('2026-06-01', 10, 20), rain('2026-06-01', 0),
      temp('2026-06-02', 10, 20), rain('2026-06-02', 0),
      temp('2026-06-03', 10, 20), rain('2026-06-03', 0),
      // 4 June missing
      temp('2026-06-05', 10, 20), rain('2026-06-05', 0),
      temp('2026-06-06', 10, 20), rain('2026-06-06', 0),
    ];
    const dry = weatherRuns(s, completeDates(s)).find((r) => r.kind === 'dry')!;
    expect(dry.current).toBe(2);
    expect(dry.currentStart).toBe('2026-06-05');
    expect(dry.longest).toBe(3);
    expect(dry.longestEnd).toBe('2026-06-03');

    const warm = weatherRuns(s, completeDates(s)).find((r) => r.kind === 'warm')!;
    expect(warm.current).toBe(2);
  });

  it('reports no current run when the latest day breaks it', () => {
    const s = [temp('2026-06-01', 1, 5), rain('2026-06-01', 0), temp('2026-06-02', 1, 5), rain('2026-06-02', 3)];
    const dry = weatherRuns(s, completeDates(s)).find((r) => r.kind === 'dry')!;
    expect(dry.current).toBe(0);
    expect(dry.currentStart).toBeNull();
    expect(dry.longest).toBe(1);
  });
});
