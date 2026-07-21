import { describe, it, expect, beforeEach } from 'vitest';
import { PollCurrentConditions } from './poll-current-conditions.js';
import {
  FakeWeatherDataSource,
  FakeClock,
  FakeMetrics,
  InMemoryStationRepository,
  InMemoryObservationRepository,
  aStation,
  anObservation,
} from '@weather/test-support';
import { createLogger } from '@weather/observability';

const logger = createLogger({ level: 'silent', name: 'test' });

describe('PollCurrentConditions', () => {
  let weatherSource: FakeWeatherDataSource;
  let stationRepo: InMemoryStationRepository;
  let observationRepo: InMemoryObservationRepository;
  let metrics: FakeMetrics;
  let clock: FakeClock;
  let useCase: PollCurrentConditions;

  beforeEach(() => {
    weatherSource = new FakeWeatherDataSource();
    stationRepo = new InMemoryStationRepository();
    observationRepo = new InMemoryObservationRepository();
    metrics = new FakeMetrics();
    clock = new FakeClock();
    useCase = new PollCurrentConditions(
      weatherSource,
      stationRepo,
      observationRepo,
      metrics,
      clock,
      logger,
    );
  });

  it('skips poll when no active station exists', async () => {
    await useCase.execute();
    expect(observationRepo.getAll()).toHaveLength(0);
    expect(metrics.counters).toHaveLength(0);
  });

  it('stores observations from weather source', async () => {
    const station = aStation();
    await stationRepo.save(station);

    const observation = anObservation();
    weatherSource.observations = [observation];

    await useCase.execute();

    expect(observationRepo.getAll()).toHaveLength(1);
  });

  it('records success metric on successful poll', async () => {
    const station = aStation();
    await stationRepo.save(station);
    weatherSource.observations = [anObservation()];

    await useCase.execute();

    expect(metrics.counters).toContainEqual(
      expect.objectContaining({ name: 'weather_poll_total', labels: { status: 'success' } }),
    );
    expect(metrics.histograms).toContainEqual(
      expect.objectContaining({ name: 'weather_poll_duration_seconds' }),
    );
  });

  it('records error metric and rethrows on failure', async () => {
    const station = aStation();
    await stationRepo.save(station);
    weatherSource.shouldThrow = new Error('API unavailable');

    await expect(useCase.execute()).rejects.toThrow('API unavailable');

    expect(metrics.counters).toContainEqual(
      expect.objectContaining({ name: 'weather_poll_total', labels: { status: 'error' } }),
    );
  });
});
