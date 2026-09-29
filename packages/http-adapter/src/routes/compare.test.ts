import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { GetYearComparison } from '@weather/application';
import { YearComparisonResponseSchema } from '@weather/contracts';
import {
  FakeClock,
  InMemoryStationRepository,
  InMemoryDailySummaryRepository,
  aStation,
  aDailySummary,
} from '@weather/test-support';
import { registerCompareRoutes } from './compare.js';

async function buildApp() {
  const stationRepo = new InMemoryStationRepository();
  const summaryRepo = new InMemoryDailySummaryRepository();
  await stationRepo.save(aStation());
  await summaryRepo.save(aDailySummary({ date: '2026-09-01' }));
  const app = Fastify();
  registerCompareRoutes(app, {
    getYearComparison: new GetYearComparison(stationRepo, summaryRepo, new FakeClock(new Date('2026-09-10T12:00:00Z'))),
  });
  return app;
}

describe('GET /api/v1/compare', () => {
  it('returns a comparison matching the contract', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/compare?metric=rain.daily&month=9' });
    expect(res.statusCode).toBe(200);
    const body = YearComparisonResponseSchema.parse(res.json());
    expect(body.month).toBe(9);
    expect(body.monthScores[0]!.year).toBe('2026');
  });

  it('rejects an unknown metric', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/compare?metric=temperature.outdoor' });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a month out of range', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/compare?month=13' });
    expect(res.statusCode).toBe(400);
  });
});
