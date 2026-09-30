import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { GetIngestOverview, RecordIngestReport } from '@weather/application';
import { IngestOverviewResponseSchema } from '@weather/contracts';
import { FakeClock, InMemoryIngestReportRepository } from '@weather/test-support';
import { registerIngestRoutes } from './ingest.js';

const TOKEN = 'a-long-enough-test-token';

function buildApp(ingestToken: string | null = TOKEN) {
  const repo = new InMemoryIngestReportRepository();
  const app = Fastify();
  registerIngestRoutes(app, {
    recordIngestReport: new RecordIngestReport(repo, new FakeClock(new Date('2026-09-30T18:05:00Z'))),
    getIngestOverview: new GetIngestOverview(repo),
    ingestToken: ingestToken ?? undefined,
  });
  return { app, repo };
}

const forecast = {
  station: 'Home',
  evening: {
    date: '2026-09-30', night_min: 6.2, night_min_range: [3.9, 8.1], frost_chance: 0.02,
    day_max: 15.4, rain_next_24h_chance: 0.61, analogs: [{ date: '2024-10-02', night_min: 5.8 }],
  },
  latest_hour: { time: '2026-09-30T18:00:00+01:00', rain_next_6h_chance: 0.3, temp_in_24h: 12.1 },
  brief: 'Station: Home\nNight low: 6.2 °C',
  forecast: 'A mild night, around 6 °C.',
};

function post(app: ReturnType<typeof buildApp>['app'], kind: string, body: unknown, token: string | null = TOKEN) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/ingest/${kind}`,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'x-source': 'spark' },
    payload: body as object,
  });
}

describe('POST /api/v1/ingest/:kind', () => {
  it('stores a forecast and shows it in the overview', async () => {
    const { app } = buildApp();
    const res = await post(app, 'forecast', forecast);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ kind: 'forecast', source: 'spark' });

    const overview = await app.inject({ method: 'GET', url: '/api/v1/ingest' });
    const body = IngestOverviewResponseSchema.parse(overview.json());
    expect(body.uploadsEnabled).toBe(true);
    expect(body.latest.forecast?.payload.forecast).toBe('A mild night, around 6 °C.');
    expect(body.recent).toHaveLength(1);
  });

  it('accepts model scores, outages and harvest status', async () => {
    const { app, repo } = buildApp();
    expect((await post(app, 'model-scores', {
      tasks: {
        night_min: { description: 'Night low', test_rows: 300, mae: { model: 1.1, climatology: 2.3, persistence: 1.9 }, skill: { vs_climatology: 0.52 } },
        rain_next_6h: { skipped: 'not enough data' },
      },
    })).statusCode).toBe(201);
    expect((await post(app, 'outages', [
      { stationId: '1', from: '2024-02-01T10:00:00.000Z', to: '2024-02-03T08:00:00.000Z', kind: 'no-data', recordsWithoutData: 0 },
    ])).statusCode).toBe(201);
    expect((await post(app, 'harvest', { status: 'ok', task: 'harvest' })).statusCode).toBe(201);
    expect(repo.getAll()).toHaveLength(3);
  });

  it('refuses a wrong or missing token', async () => {
    const { app, repo } = buildApp();
    expect((await post(app, 'forecast', forecast, 'wrong-token')).statusCode).toBe(401);
    expect((await post(app, 'forecast', forecast, null)).statusCode).toBe(401);
    expect(repo.getAll()).toHaveLength(0);
  });

  it('refuses every upload when no token is configured', async () => {
    const { app } = buildApp(null);
    expect((await post(app, 'forecast', forecast)).statusCode).toBe(503);
    const overview = await app.inject({ method: 'GET', url: '/api/v1/ingest' });
    expect(overview.json().uploadsEnabled).toBe(false);
  });

  it('rejects unknown kinds and payloads of the wrong shape', async () => {
    const { app } = buildApp();
    expect((await post(app, 'photos', {})).statusCode).toBe(404);
    const res = await post(app, 'forecast', { tasks: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_PAYLOAD');
  });
});
