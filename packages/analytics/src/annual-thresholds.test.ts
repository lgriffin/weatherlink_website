import { describe, it, expect } from 'vitest';
import { aDailySummary } from '@weather/test-support';
import type { MeasurementName, CanonicalUnit } from '@weather/domain';
import { annualThresholds } from './annual-thresholds.js';

function temp(date: string, min: number, max: number) {
  return aDailySummary({
    date, measurementName: 'temperature.outdoor' as MeasurementName, unit: 'celsius' as CanonicalUnit,
    min, max, avg: (min + max) / 2, count: 288,
  });
}

function rain(date: string, total: number) {
  return aDailySummary({
    date, measurementName: 'rain.daily' as MeasurementName, unit: 'mm' as CanonicalUnit,
    min: null, max: total, avg: null, count: 288,
  });
}

const summaries = [
  temp('2025-07-01', 12, 22.5), rain('2025-07-01', 0),
  temp('2025-07-02', 13, 20.0), rain('2025-07-02', 6),
  temp('2025-07-03', 11, 24.9), rain('2025-07-03', 2),
  temp('2026-01-10', -2.5, 4), rain('2026-01-10', 12),
  temp('2026-01-11', 3, 7), rain('2026-01-11', 0),
];
const all = new Set(summaries.map((s) => s.date));

describe('annualThresholds', () => {
  const result = annualThresholds(summaries, all, ['2025', '2026'], '2026-01-31');
  const group = (key: string) => result.groups.find((g) => g.key === key)!;

  it('counts warm days from 20 °C up to the record high', () => {
    const warm = group('warm');
    expect(warm.rows.map((r) => r.threshold)).toEqual([20, 21, 22, 23, 24]);
    expect(warm.rows[0]!.byYear['2025']!.months[6]).toBe(3);   // ≥ 20: all three July days
    expect(warm.rows[2]!.byYear['2025']!.months[6]).toBe(2);   // ≥ 22
    expect(warm.rows[4]!.byYear['2025']!.total).toBe(1);       // ≥ 24
  });

  it('counts cold days from 5 °C down to the record low', () => {
    const cold = group('cold');
    expect(cold.rows.map((r) => r.threshold)).toEqual([5, 4, 3, 2, 1, 0, -1, -2]);
    expect(cold.rows[0]!.byYear['2026']!.months[0]).toBe(2);     // ≤ 5
    expect(cold.rows.at(-1)!.byYear['2026']!.months[0]).toBe(1); // ≤ -2
  });

  it('counts wet days from 2 mm up to the wettest day', () => {
    const wet = group('wet');
    expect(wet.rows.map((r) => r.threshold)).toEqual([2, 5, 10]);
    expect(wet.rows[0]!.byYear['2025']!.total).toBe(2);
    expect(wet.rows[2]!.byYear['2026']!.months[0]).toBe(1);
  });

  it('leaves months without complete days empty rather than zero', () => {
    const row = group('warm').rows[0]!;
    expect(row.byYear['2025']!.months[0]).toBeNull();
    expect(row.byYear['2026']!.months[0]).toBe(0);
    expect(row.byYear['2026']!.months[5]).toBeNull();
  });

  it('skips incomplete (outage) days and reports coverage', () => {
    const partial = new Set([...all].filter((d) => d !== '2025-07-03'));
    const r = annualThresholds(summaries, partial, ['2025', '2026'], '2026-01-31');
    expect(r.groups[0]!.rows[0]!.byYear['2025']!.months[6]).toBe(2);
    expect(r.coverage[0]!.completeDays[6]).toBe(2);
    expect(r.coverage[0]!.elapsedDays[6]).toBe(31);
    expect(r.coverage[1]!.elapsedDays[0]).toBe(31);
    expect(r.coverage[1]!.elapsedDays[1]).toBe(0);
  });
});
