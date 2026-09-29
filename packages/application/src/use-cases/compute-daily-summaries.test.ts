import { describe, it, expect, beforeEach } from 'vitest';
import { ComputeDailySummaries } from './compute-daily-summaries.js';
import {
  InMemoryStationRepository,
  InMemoryObservationRepository,
  InMemoryDailySummaryRepository,
  aStation,
  anObservation,
  aMeasurement,
} from '@weather/test-support';
import { observationId } from '@weather/domain';
import type { MeasurementName, ObservationSource } from '@weather/domain';
import { createLogger } from '@weather/observability';

const logger = createLogger({ level: 'silent', name: 'test' });

function obs(id: string, at: string, source: ObservationSource, values: Record<string, number>) {
  return anObservation({
    id: observationId(id),
    timestamp: new Date(at),
    source,
    measurements: new Map(
      Object.entries(values).map(([name, value]) => [
        name,
        aMeasurement({ name: name as MeasurementName, value, unit: name.startsWith('rain') ? 'mm' : 'celsius' }),
      ]),
    ),
  });
}

describe('ComputeDailySummaries', () => {
  let stationRepo: InMemoryStationRepository;
  let observationRepo: InMemoryObservationRepository;
  let summaryRepo: InMemoryDailySummaryRepository;
  let useCase: ComputeDailySummaries;

  beforeEach(async () => {
    stationRepo = new InMemoryStationRepository();
    observationRepo = new InMemoryObservationRepository();
    summaryRepo = new InMemoryDailySummaryRepository();
    await stationRepo.save(aStation());
    useCase = new ComputeDailySummaries(stationRepo, observationRepo, summaryRepo, logger, 'Europe/Dublin');
  });

  it('uses the local calendar day, not the UTC one', async () => {
    await observationRepo.saveMany([
      // 23:30 UTC on 30 Jun is 00:30 on 1 Jul in Dublin
      obs('a', '2026-06-30T23:30:00Z', 'historic', { 'temperature.outdoor': 9 }),
      obs('b', '2026-07-01T12:00:00Z', 'historic', { 'temperature.outdoor': 21 }),
      // 23:30 UTC on 1 Jul is already 2 Jul in Dublin
      obs('c', '2026-07-01T23:30:00Z', 'historic', { 'temperature.outdoor': 5 }),
    ]);

    await useCase.execute('2026-07-01');

    const temp = summaryRepo.getAll().find((s) => s.measurementName === 'temperature.outdoor')!;
    expect(temp.date).toBe('2026-07-01');
    expect(temp.min).toBe(9);
    expect(temp.max).toBe(21);
    expect(temp.count).toBe(2);
  });

  it('ignores live polls when archive intervals exist for the day', async () => {
    await observationRepo.saveMany([
      obs('a', '2026-01-10T10:00:00Z', 'historic', { 'temperature.outdoor': 6 }),
      obs('b', '2026-01-10T10:01:00Z', 'current', { 'temperature.outdoor': 30 }),
    ]);

    await useCase.execute('2026-01-10');

    const temp = summaryRepo.getAll().find((s) => s.measurementName === 'temperature.outdoor')!;
    expect(temp.max).toBe(6);
    expect(temp.count).toBe(1);
  });

  it('falls back to live polls when the day has no archive data', async () => {
    await observationRepo.saveMany([
      obs('b', '2026-01-10T10:01:00Z', 'current', { 'temperature.outdoor': 7 }),
    ]);

    await useCase.execute('2026-01-10');

    expect(summaryRepo.getAll().find((s) => s.measurementName === 'temperature.outdoor')!.max).toBe(7);
  });
});
