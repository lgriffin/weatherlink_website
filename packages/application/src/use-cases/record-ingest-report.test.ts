import { describe, it, expect } from 'vitest';
import { FakeClock, InMemoryIngestReportRepository } from '@weather/test-support';
import { RecordIngestReport } from './record-ingest-report.js';
import { GetIngestOverview } from './get-ingest-overview.js';

describe('RecordIngestReport', () => {
  it('stores reports and keeps only the newest per kind', async () => {
    const repo = new InMemoryIngestReportRepository();
    const clock = new FakeClock(new Date('2026-09-30T10:00:00Z'));
    const record = new RecordIngestReport(repo, clock, 2);

    for (let i = 1; i <= 3; i++) {
      await record.execute('forecast', 'spark', { n: i });
      clock.advance(60_000);
    }
    await record.execute('harvest', 'nas', { status: 'ok' });

    const forecasts = repo.getAll().filter((r) => r.kind === 'forecast');
    expect(forecasts.map((r) => r.payload)).toEqual([{ n: 2 }, { n: 3 }]);
    expect(repo.getAll().filter((r) => r.kind === 'harvest')).toHaveLength(1);
  });
});

describe('GetIngestOverview', () => {
  it('returns the latest report per kind and recent uploads without payloads', async () => {
    const repo = new InMemoryIngestReportRepository();
    const clock = new FakeClock(new Date('2026-09-30T10:00:00Z'));
    const record = new RecordIngestReport(repo, clock);
    await record.execute('forecast', 'spark', { brief: 'old' });
    clock.advance(60_000);
    await record.execute('forecast', 'spark', { brief: 'new' });
    await record.execute('outages', 'nas', []);

    const overview = await new GetIngestOverview(repo).execute();

    expect(overview.latest.forecast?.payload).toEqual({ brief: 'new' });
    expect(overview.latest.outages?.payload).toEqual([]);
    expect(overview.latest['model-scores']).toBeNull();
    expect(overview.latest.harvest).toBeNull();
    expect(overview.recent).toHaveLength(3);
    expect(overview.recent[0]).not.toHaveProperty('payload');
  });
});
