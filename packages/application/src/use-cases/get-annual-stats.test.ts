import { describe, it, expect } from 'vitest';
import {
  FakeClock,
  InMemoryStationRepository,
  InMemoryDailySummaryRepository,
  aStation,
  aDailySummary,
} from '@weather/test-support';
import type { MeasurementName } from '@weather/domain';
import { GetAnnualStats } from './get-annual-stats.js';

describe('GetAnnualStats', () => {
  it('covers the latest three years up to yesterday', async () => {
    const stationRepo = new InMemoryStationRepository();
    const summaryRepo = new InMemoryDailySummaryRepository();
    const station = aStation();
    await stationRepo.save(station);
    await summaryRepo.save(aDailySummary({
      stationId: station.id, date: '2025-07-01', measurementName: 'temperature.outdoor' as MeasurementName,
      min: 12, max: 23, avg: 17, count: 288,
    }));
    await summaryRepo.save(aDailySummary({
      stationId: station.id, date: '2026-09-30', measurementName: 'temperature.outdoor' as MeasurementName,
      min: 12, max: 26, avg: 17, count: 288,
    }));

    const useCase = new GetAnnualStats(stationRepo, summaryRepo, new FakeClock(new Date('2026-09-30T10:00:00Z')), 'Europe/Dublin');
    const result = await useCase.execute();

    expect(result.asOf).toBe('2026-09-29');
    expect(result.years).toEqual(['2024', '2025', '2026']);
    const warm = result.groups.find((g) => g.key === 'warm')!;
    expect(warm.rows[0]!.byYear['2025']!.total).toBe(1);
    // Today is not complete yet, so its 26 °C doesn't count.
    expect(warm.rows[0]!.byYear['2026']!.total).toBe(0);
  });
});
