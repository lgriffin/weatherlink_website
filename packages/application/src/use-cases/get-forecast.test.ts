import { describe, it, expect } from 'vitest';
import type { ForecastRepository, IngestReportRepository, WarningsSource, WeatherWarning } from '@weather/domain';
import { FakeClock, InMemoryIngestReportRepository } from '@weather/test-support';
import { GetForecast } from './get-forecast.js';

/** Forecasts arrive as ingest reports, as the persistence adapter reads them. */
class IngestForecastRepository implements ForecastRepository {
  constructor(private readonly reports: IngestReportRepository) {}
  async findLatest() {
    const r = await this.reports.findLatest('forecast');
    return r ? { source: r.source, receivedAt: r.receivedAt, payload: r.payload } : null;
  }
}

const warning: WeatherWarning = {
  level: 'yellow', type: 'Wind', headline: 'Wind warning', description: '', onset: null, expiry: null, regions: [],
};

function warningsSource(result: WeatherWarning[] | Error): WarningsSource {
  return { current: async () => { if (result instanceof Error) throw result; return result; } };
}

describe('GetForecast', () => {
  it('returns the newest forecast with the warnings in force', async () => {
    const reports = new InMemoryIngestReportRepository();
    await reports.save({ kind: 'forecast', source: 'actions', receivedAt: new Date('2026-10-11T18:10:00Z'), payload: { n: 1 } });
    await reports.save({ kind: 'forecast', source: 'actions', receivedAt: new Date('2026-10-12T18:10:00Z'), payload: { n: 2 } });
    await reports.save({ kind: 'harvest', source: 'nas', receivedAt: new Date('2026-10-12T19:00:00Z'), payload: {} });
    const clock = new FakeClock(new Date('2026-10-12T20:00:00Z'));
    const result = await new GetForecast(new IngestForecastRepository(reports), warningsSource([warning]), clock).execute();
    expect(result.forecast).toMatchObject({ source: 'actions', payload: { n: 2 }, stale: false });
    expect(result.warnings).toEqual([warning]);
  });

  it('marks an old forecast stale and survives the warnings being unreachable', async () => {
    const reports = new InMemoryIngestReportRepository();
    await reports.save({ kind: 'forecast', source: 'spark', receivedAt: new Date('2026-10-10T18:00:00Z'), payload: {} });
    const clock = new FakeClock(new Date('2026-10-12T18:00:00Z'));
    const result = await new GetForecast(new IngestForecastRepository(reports), warningsSource(new Error('down')), clock).execute();
    expect(result.forecast?.stale).toBe(true);
    expect(result.warnings).toBeNull();
  });

  it('judges freshness by the evening it was made for, in local time', async () => {
    const reports = new InMemoryIngestReportRepository();
    // Re-sent this evening, but made for last night.
    await reports.save({ kind: 'forecast', source: 'actions', receivedAt: new Date('2026-10-12T18:10:00Z'),
                         payload: { evening: { date: '2026-10-11' } } });
    const repo = new IngestForecastRepository(reports);
    const at = (iso: string) => new GetForecast(repo, warningsSource([]), new FakeClock(new Date(iso)), { timeZone: 'Europe/Dublin' });
    expect((await at('2026-10-12T18:30:00Z').execute()).forecast?.stale).toBe(false); // 19:30 local: tonight's not due yet
    expect((await at('2026-10-12T19:30:00Z').execute()).forecast?.stale).toBe(true); // 20:30 local: overdue
  });

  it('logs why the warnings could not be fetched', async () => {
    const errors: unknown[] = [];
    await new GetForecast(new IngestForecastRepository(new InMemoryIngestReportRepository()),
      warningsSource(new Error('timeout')), new FakeClock(new Date()), { onWarningsError: (e) => errors.push(e) }).execute();
    expect(errors).toHaveLength(1);
  });

  it('has nothing to show before the first forecast', async () => {
    const result = await new GetForecast(
      new IngestForecastRepository(new InMemoryIngestReportRepository()), warningsSource([]), new FakeClock(new Date()),
    ).execute();
    expect(result).toEqual({ forecast: null, warnings: [] });
  });
});
