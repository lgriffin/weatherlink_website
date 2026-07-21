import { describe, it, expect, beforeEach } from 'vitest';
import { GetCurrentDashboard } from './get-current-dashboard.js';
import {
  FakeClock,
  InMemoryStationRepository,
  InMemoryObservationRepository,
  aStation,
  anObservation,
} from '@weather/test-support';

describe('GetCurrentDashboard', () => {
  let stationRepo: InMemoryStationRepository;
  let observationRepo: InMemoryObservationRepository;
  let clock: FakeClock;
  let useCase: GetCurrentDashboard;

  beforeEach(() => {
    stationRepo = new InMemoryStationRepository();
    observationRepo = new InMemoryObservationRepository();
    clock = new FakeClock(new Date('2026-07-17T14:05:00Z'));
    useCase = new GetCurrentDashboard(stationRepo, observationRepo, clock);
  });

  it('returns unavailable when no station is configured', async () => {
    const result = await useCase.execute();
    expect(result.station).toBeNull();
    expect(result.observation).toBeNull();
    expect(result.freshness.state).toBe('unavailable');
  });

  it('returns station with no observation', async () => {
    await stationRepo.save(aStation());
    const result = await useCase.execute();

    expect(result.station).not.toBeNull();
    expect(result.observation).toBeNull();
    expect(result.freshness.state).toBe('unavailable');
  });

  it('returns current observation with live freshness', async () => {
    const station = aStation();
    await stationRepo.save(station);

    const observation = anObservation({
      timestamp: new Date('2026-07-17T14:04:00Z'),
    });
    await observationRepo.save(observation);

    const result = await useCase.execute();

    expect(result.station).not.toBeNull();
    expect(result.observation).not.toBeNull();
    expect(result.freshness.state).toBe('live');
    expect(result.freshness.ageSeconds).toBe(60);
  });

  it('returns delayed freshness for older observations', async () => {
    const station = aStation();
    await stationRepo.save(station);

    const observation = anObservation({
      timestamp: new Date('2026-07-17T13:59:00Z'),
    });
    await observationRepo.save(observation);

    const result = await useCase.execute();

    expect(result.freshness.state).toBe('delayed');
    expect(result.freshness.ageSeconds).toBe(360);
  });

  it('returns stale freshness for very old observations', async () => {
    const station = aStation();
    await stationRepo.save(station);

    const observation = anObservation({
      timestamp: new Date('2026-07-17T13:40:00Z'),
    });
    await observationRepo.save(observation);

    const result = await useCase.execute();

    expect(result.freshness.state).toBe('stale');
  });
});
