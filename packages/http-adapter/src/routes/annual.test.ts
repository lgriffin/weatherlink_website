import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { GetAnnualStats } from '@weather/application';
import { AnnualStatsResponseSchema } from '@weather/contracts';
import {
  FakeClock,
  InMemoryStationRepository,
  InMemoryDailySummaryRepository,
  aStation,
  aDailySummary,
} from '@weather/test-support';
import { registerAnnualRoutes } from './annual.js';

async function buildApp() {
  const stationRepo = new InMemoryStationRepository();
  const summaryRepo = new InMemoryDailySummaryRepository();
  await stationRepo.save(aStation());
  await summaryRepo.save(aDailySummary({ date: '2026-09-01' }));
  const app = Fastify();
  registerAnnualRoutes(app, {
    getAnnualStats: new GetAnnualStats(stationRepo, summaryRepo, new FakeClock(new Date('2026-09-10T12:00:00Z'))),
  });
  return app;
}

describe('GET /api/v1/annual', () => {
  it('returns three years matching the contract', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/annual' });
    expect(res.statusCode).toBe(200);
    const body = AnnualStatsResponseSchema.parse(res.json());
    expect(body.years).toEqual(['2024', '2025', '2026']);
    expect(body.groups.map((g) => g.key)).toEqual(['warm', 'cold', 'wet']);
  });

  it('rejects a bad year count', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/annual?years=0' });
    expect(res.statusCode).toBe(400);
  });
});
