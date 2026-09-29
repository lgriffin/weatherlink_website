import { describe, it, expect, beforeEach } from 'vitest';
import { HarvestFullArchive } from './harvest-full-archive.js';
import { ArchiveIngestor } from '../services/archive-ingestor.js';
import {
  FakeWeatherDataSource,
  FakeClock,
  InMemoryStationRepository,
  InMemorySensorRepository,
  InMemoryObservationRepository,
  InMemorySyncWindowRepository,
  InMemoryArchiveRecordRepository,
  aStation,
  aSensor,
  anArchiveRecord,
} from '@weather/test-support';
import { createLogger } from '@weather/observability';

const logger = createLogger({ level: 'silent', name: 'test' });
const noSleep = async () => {};

describe('HarvestFullArchive', () => {
  let weatherSource: FakeWeatherDataSource;
  let stationRepo: InMemoryStationRepository;
  let sensorRepo: InMemorySensorRepository;
  let observationRepo: InMemoryObservationRepository;
  let syncWindowRepo: InMemorySyncWindowRepository;
  let archiveRepo: InMemoryArchiveRecordRepository;
  let clock: FakeClock;
  let useCase: HarvestFullArchive;

  beforeEach(async () => {
    weatherSource = new FakeWeatherDataSource();
    stationRepo = new InMemoryStationRepository();
    sensorRepo = new InMemorySensorRepository();
    observationRepo = new InMemoryObservationRepository();
    syncWindowRepo = new InMemorySyncWindowRepository();
    archiveRepo = new InMemoryArchiveRecordRepository();
    clock = new FakeClock(new Date('2026-07-04T00:00:00Z'));
    await stationRepo.save(aStation({ registeredAt: new Date('2026-07-01T00:00:00Z') }));
    await sensorRepo.save(aSensor());
    const ingestor = new ArchiveIngestor(weatherSource, archiveRepo, observationRepo, syncWindowRepo, clock);
    useCase = new HarvestFullArchive(ingestor, stationRepo, sensorRepo, syncWindowRepo, clock, logger, 0, noSleep);

    weatherSource.historicArchive = [
      anArchiveRecord({ timestamp: new Date('2026-07-01T06:00:00Z'), payload: { 'rain.interval': 1 } }),
      anArchiveRecord({ timestamp: new Date('2026-07-02T06:00:00Z'), payload: { 'rain.interval': 2 } }),
      anArchiveRecord({ timestamp: new Date('2026-07-03T06:00:00Z'), payload: { 'rain.interval': 3 } }),
    ];
  });

  it('fetches every day from registration in 24 hour requests', async () => {
    const result = await useCase.execute();

    expect(result).toEqual({ daysFetched: 3, daysSkipped: 0, daysFailed: 0, observations: 3 });
    expect(weatherSource.historicRequests.every((r) => r.end - r.start <= 86400)).toBe(true);
    expect(archiveRepo.getAll()).toHaveLength(3);
  });

  it('resumes by skipping days already synced', async () => {
    await useCase.execute();
    weatherSource.historicRequests = [];

    const result = await useCase.execute();

    expect(result.daysSkipped).toBe(3);
    expect(weatherSource.historicRequests).toHaveLength(0);
  });

  it('with force, re-downloads and replaces observations without duplicating them', async () => {
    await useCase.execute();
    const result = await useCase.execute({ force: true });

    expect(result.daysFetched).toBe(3);
    expect(observationRepo.getAll()).toHaveLength(3);
    expect(archiveRepo.getAll()).toHaveLength(3);
  });

  it('counts failed days and carries on', async () => {
    weatherSource.shouldThrow = new Error('upstream down');
    const result = await useCase.execute();
    expect(result.daysFailed).toBe(3);
  });
});
