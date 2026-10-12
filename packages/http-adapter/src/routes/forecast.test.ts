import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { GetForecast } from '@weather/application';
import { ForecastResponseSchema } from '@weather/contracts';
import type { WarningsSource } from '@weather/domain';
import { FakeClock } from '@weather/test-support';
import { registerForecastRoutes } from './forecast.js';

const payload = {
  station: 'Home', issued_at: '2026-10-12T17:20:00Z',
  evening: { date: '2026-10-12', night_min: 1.2, night_min_range: [-1.0, 3.5], frost_chance: 0.31, day_max: 11.0,
    rain_next_24h_chance: 0.2, normal_low: 5.1 },
  models: { night_min: 'night_min+guidance' },
  guidance: { ecmwf_ifs025: { night_min: 3.1, day_max: 11.5, rain_24h: 0.0 }, met_eireann: { night_min: 2.0 } },
  brief: 'Issued 2026-10-12 18:00.',
};

function app(stored: unknown | null, warnings: WarningsSource) {
  const server = Fastify();
  const forecasts = {
    findLatest: async () => (stored === null ? null : { source: 'github-actions', receivedAt: new Date('2026-10-12T17:25:00Z'), payload: stored }),
  };
  registerForecastRoutes(server, { getForecast: new GetForecast(forecasts, warnings, new FakeClock(new Date('2026-10-12T19:00:00Z'))) });
  return server;
}

describe('GET /api/v1/forecast', () => {
  it('serves the latest forecast and the warnings', async () => {
    const res = await app(payload, {
      current: async () => [{ level: 'yellow', type: 'Wind', headline: 'Wind warning for Galway', description: 'Gusts.',
        onset: new Date('2026-10-12T17:00:00Z'), expiry: null, regions: ['EI07'] }],
    }).inject({ method: 'GET', url: '/api/v1/forecast' });
    expect(res.statusCode).toBe(200);
    const body = ForecastResponseSchema.parse(res.json());
    expect(body.forecast?.payload.guidance?.['met_eireann']?.night_min).toBe(2.0);
    expect(body.forecast?.stale).toBe(false);
    expect(body.warnings?.[0]).toMatchObject({ level: 'yellow', onset: '2026-10-12T17:00:00.000Z', expiry: null });
  });

  it('answers with nothing yet, and null warnings when Met Éireann is down', async () => {
    const res = await app(null, { current: async () => { throw new Error('down'); } })
      .inject({ method: 'GET', url: '/api/v1/forecast' });
    expect(ForecastResponseSchema.parse(res.json())).toEqual({ forecast: null, warnings: null });
  });

  it('leaves out a stored forecast that no longer fits the contract', async () => {
    const res = await app({ evening: {} }, { current: async () => [] }).inject({ method: 'GET', url: '/api/v1/forecast' });
    expect(res.json()).toEqual({ forecast: null, warnings: [] });
  });
});
