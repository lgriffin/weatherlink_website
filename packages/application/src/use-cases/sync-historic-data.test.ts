import { describe, it, expect, beforeEach } from 'vitest';
import { SyncHistoricData } from './sync-historic-data.js';
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
  anObservation,
  anArchiveRecord,
} from '@weather/test-support';
import { createLogger } from '@weather/observability';
import { ArchiveIngestor } from '../services/archive-ingestor.js';

const logger = createLogger({ level: 'silent', name: 'test' });

describe('SyncHistoricData', () => {
  let weatherSource: FakeWeatherDataSource;
  let stationRepo: InMemoryStationRepository;
  let sensorRepo: InMemorySensorRepository;
  let observationRepo: InMemoryObservationRepository;
  let syncWindowRepo: InMemorySyncWindowRepository;
  let clock: FakeClock;
  let archiveRepo: InMemoryArchiveRecordRepository;
  let ingestor: ArchiveIngestor;
  let useCase: SyncHistoricData;

  beforeEach(() => {
    weatherSource = new FakeWeatherDataSource();
    stationRepo = new InMemoryStationRepository();
    sensorRepo = new InMemorySensorRepository();
    observationRepo = new InMemoryObservationRepository();
    syncWindowRepo = new InMemorySyncWindowRepository();
    clock = new FakeClock(new Date('2026-07-18T12:00:00Z'));
    archiveRepo = new InMemoryArchiveRecordRepository();
    ingestor = new ArchiveIngestor(weatherSource, archiveRepo, observationRepo, syncWindowRepo, clock);
    useCase = new SyncHistoricData(
      ingestor, stationRepo, sensorRepo,
      syncWindowRepo, clock, logger,
    );
  });

  it('skips when no active station', async () => {
    await useCase.execute();
    expect(observationRepo.getAll()).toHaveLength(0);
  });

  it('skips when no ISS sensor', async () => {
    await stationRepo.save(aStation());
    await sensorRepo.save(aSensor({ category: 'barometer' }));
    await useCase.execute();
    expect(observationRepo.getAll()).toHaveLength(0);
  });

  it('syncs observations for gaps in last 24h', async () => {
    await stationRepo.save(aStation());
    await sensorRepo.save(aSensor());

    const obs = anObservation({ source: 'historic' });
    weatherSource.historicObservations = [obs];

    await useCase.execute();

    expect(observationRepo.getAll()).toHaveLength(1);
    const windows = syncWindowRepo.getAll();
    expect(windows).toHaveLength(1);
    expect(windows[0]!.observationCount).toBe(1);
  });

  it('skips when no gaps exist', async () => {
    const station = aStation();
    const sensor = aSensor();
    await stationRepo.save(station);
    await sensorRepo.save(sensor);

    const oneDayAgo = new Date(clock.now().getTime() - 24 * 60 * 60 * 1000);
    await syncWindowRepo.save({
      stationId: station.id,
      sensorId: sensor.id,
      startTimestamp: oneDayAgo,
      endTimestamp: clock.now(),
      syncedAt: clock.now(),
      observationCount: 96,
    });

    await useCase.execute();
    expect(observationRepo.getAll()).toHaveLength(0);
  });
});

describe('SyncHistoricData raw archive', () => {
  it('keeps the raw archive records it fetched', async () => {
    const weatherSource = new FakeWeatherDataSource();
    const stationRepo = new InMemoryStationRepository();
    const sensorRepo = new InMemorySensorRepository();
    const observationRepo = new InMemoryObservationRepository();
    const syncWindowRepo = new InMemorySyncWindowRepository();
    const archiveRepo = new InMemoryArchiveRecordRepository();
    const clock = new FakeClock(new Date('2026-07-18T12:00:00Z'));
    const station = aStation();
    const sensor = aSensor();
    await stationRepo.save(station);
    await sensorRepo.save(sensor);
    weatherSource.historicArchive = [
      anArchiveRecord({ stationId: station.id, sensorId: sensor.id, timestamp: new Date('2026-07-18T06:00:00Z') }),
    ];

    const useCase = new SyncHistoricData(
      new ArchiveIngestor(weatherSource, archiveRepo, observationRepo, syncWindowRepo, clock),
      stationRepo, sensorRepo, syncWindowRepo, clock, logger,
    );
    await useCase.execute();

    expect(archiveRepo.getAll()).toHaveLength(1);
    expect(observationRepo.getAll()).toHaveLength(1);
    expect(observationRepo.getAll()[0]!.source).toBe('historic');
  });
});
