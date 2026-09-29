import { describe, it, expect } from 'vitest';
import { RebuildFromArchive } from './rebuild-from-archive.js';
import { ComputeDailySummaries } from './compute-daily-summaries.js';
import { ComputeRecords } from './compute-records.js';
import {
  FakeWeatherDataSource,
  FakeClock,
  InMemoryStationRepository,
  InMemoryObservationRepository,
  InMemoryArchiveRecordRepository,
  InMemoryDailySummaryRepository,
  InMemoryRecordRepository,
  aStation,
  anArchiveRecord,
  anObservation,
  aDailySummary,
} from '@weather/test-support';
import { observationId } from '@weather/domain';
import { createLogger } from '@weather/observability';

const logger = createLogger({ level: 'silent', name: 'test' });

describe('RebuildFromArchive', () => {
  it('re-derives observations, summaries and records from the raw archive', async () => {
    const stationRepo = new InMemoryStationRepository();
    const archiveRepo = new InMemoryArchiveRecordRepository();
    const observationRepo = new InMemoryObservationRepository();
    const summaryRepo = new InMemoryDailySummaryRepository();
    const recordRepo = new InMemoryRecordRepository();
    const clock = new FakeClock(new Date('2026-07-20T12:00:00Z'));
    const tz = 'Europe/Dublin';
    await stationRepo.save(aStation());

    // Old, wrongly mapped observation for the same interval
    await observationRepo.save(anObservation({
      id: observationId('stale'),
      source: 'historic',
      timestamp: new Date('2026-07-17T06:00:00Z'),
    }));
    // Stale summary that the rebuild must replace
    await summaryRepo.save(aDailySummary({ date: '2026-07-17', measurementName: 'rain.daily', max: 0.4 }));

    await archiveRepo.saveMany([
      anArchiveRecord({ timestamp: new Date('2026-07-17T06:00:00Z'), payload: { 'rain.interval': 0.4, 'temperature.outdoor': 12 } }),
      anArchiveRecord({ timestamp: new Date('2026-07-17T06:15:00Z'), payload: { 'rain.interval': 5.2, 'temperature.outdoor': 13 } }),
      anArchiveRecord({ timestamp: new Date('2026-07-17T06:30:00Z'), payload: { 'rain.interval': 2.0, 'temperature.outdoor': 14 } }),
    ]);

    const computeSummaries = new ComputeDailySummaries(stationRepo, observationRepo, summaryRepo, logger, tz);
    const computeRecords = new ComputeRecords(stationRepo, summaryRepo, recordRepo, logger);
    const rebuild = new RebuildFromArchive(
      new FakeWeatherDataSource(), stationRepo, archiveRepo, observationRepo, summaryRepo,
      computeSummaries, computeRecords, clock, logger, tz,
    );

    const result = await rebuild.execute();

    expect(result.archiveRecords).toBe(3);
    expect(observationRepo.getAll()).toHaveLength(3);
    expect(observationRepo.getAll().some((o) => o.id === 'stale')).toBe(false);

    const rain = summaryRepo.getAll().find((s) => s.date === '2026-07-17' && s.measurementName === 'rain.daily');
    expect(rain?.max).toBe(7.6);

    const records = await recordRepo.findByStation(aStation().id);
    const wettest = records.find((r) => r.description === 'Wettest single day');
    expect(wettest?.value).toBe(7.6);
  });
});
