import { describe, it, expect } from 'vitest';
import { GetYearComparison } from './get-year-comparison.js';
import {
  FakeClock,
  InMemoryStationRepository,
  InMemoryDailySummaryRepository,
  aStation,
  aDailySummary,
} from '@weather/test-support';
import type { MeasurementName, CanonicalUnit } from '@weather/domain';

describe('GetYearComparison', () => {
  it('compares years up to yesterday in the station time zone', async () => {
    const stationRepo = new InMemoryStationRepository();
    const summaryRepo = new InMemoryDailySummaryRepository();
    await stationRepo.save(aStation());
    for (const date of ['2025-09-28', '2025-09-29', '2026-09-28', '2026-09-29']) {
      await summaryRepo.save(aDailySummary({ date }));
      await summaryRepo.save(aDailySummary({
        date, measurementName: 'rain.daily' as MeasurementName, unit: 'mm' as CanonicalUnit,
        min: null, max: 1.5, avg: null,
      }));
    }

    // 23:30 UTC on 29 Sep is already 30 Sep in Dublin, so yesterday is the 29th
    const useCase = new GetYearComparison(
      stationRepo, summaryRepo, new FakeClock(new Date('2026-09-29T23:30:00Z')), 'Europe/Dublin',
    );
    const result = await useCase.execute('rain.daily', 9);

    expect(result.asOf).toBe('2026-09-29');
    expect(result.runningTotals.map((t) => [t.year, t.final])).toEqual([['2025', 3], ['2026', 3]]);
    expect(result.monthScores.map((m) => m.rainTotal)).toEqual([3, 3]);
    expect(result.runs.find((r) => r.kind === 'wet')!.current).toBe(2);
  });

  it('returns an empty comparison without a station', async () => {
    const useCase = new GetYearComparison(
      new InMemoryStationRepository(), new InMemoryDailySummaryRepository(), new FakeClock(new Date()),
    );
    const result = await useCase.execute('rain.daily', 1);
    expect(result.runningTotals).toEqual([]);
  });
});
