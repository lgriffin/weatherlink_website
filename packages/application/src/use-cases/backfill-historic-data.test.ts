import { describe, it, expect, beforeEach } from 'vitest';
import { BackfillHistoricData } from './backfill-historic-data.js';
import {
  FakeWeatherDataSource,
  FakeClock,
  InMemoryStationRepository,
  InMemorySensorRepository,
  InMemoryObservationRepository,
  InMemorySyncWindowRepository,
  aStation,
  aSensor,
  anObservation,
} from '@weather/test-support';
import { createLogger } from '@weather/observability';

const logger = createLogger({ level: 'silent', name: 'test' });

describe('BackfillHistoricData', () => {
  let weatherSource: FakeWeatherDataSource;
  let stationRepo: InMemoryStationRepository;
  let sensorRepo: InMemorySensorRepository;
  let observationRepo: InMemoryObservationRepository;
  let syncWindowRepo: InMemorySyncWindowRepository;
  let clock: FakeClock;

  beforeEach(() => {
    weatherSource = new FakeWeatherDataSource();
    stationRepo = new InMemoryStationRepository();
    sensorRepo = new InMemorySensorRepository();
    observationRepo = new InMemoryObservationRepository();
    syncWindowRepo = new InMemorySyncWindowRepository();
    clock = new FakeClock(new Date('2026-07-18T12:00:00Z'));
  });

  it('skips when no active station', async () => {
    const useCase = new BackfillHistoricData(
      weatherSource, stationRepo, sensorRepo,
      observationRepo, syncWindowRepo, clock, logger, 3,
    );
    await useCase.execute();
    expect(observationRepo.getAll()).toHaveLength(0);
  });

  it('backfills observations for the configured number of days', async () => {
    await stationRepo.save(aStation());
    await sensorRepo.save(aSensor());

    const obs = anObservation({ source: 'historic' });
    weatherSource.historicObservations = [obs];

    const useCase = new BackfillHistoricData(
      weatherSource, stationRepo, sensorRepo,
      observationRepo, syncWindowRepo, clock, logger, 2,
    );
    await useCase.execute();

    expect(observationRepo.getAll().length).toBeGreaterThanOrEqual(1);
    expect(syncWindowRepo.getAll().length).toBeGreaterThanOrEqual(1);
  });

  it('skips already-synced windows', async () => {
    const station = aStation();
    const sensor = aSensor();
    await stationRepo.save(station);
    await sensorRepo.save(sensor);

    const now = clock.now();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    await syncWindowRepo.save({
      stationId: station.id,
      sensorId: sensor.id,
      startTimestamp: twoDaysAgo,
      endTimestamp: now,
      syncedAt: now,
      observationCount: 192,
    });

    const useCase = new BackfillHistoricData(
      weatherSource, stationRepo, sensorRepo,
      observationRepo, syncWindowRepo, clock, logger, 2,
    );
    await useCase.execute();

    expect(observationRepo.getAll()).toHaveLength(0);
  });
});
