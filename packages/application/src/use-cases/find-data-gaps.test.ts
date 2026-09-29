import { describe, it, expect } from 'vitest';
import { FindDataGaps } from './find-data-gaps.js';
import {
  FakeClock,
  InMemoryStationRepository,
  InMemorySensorRepository,
  InMemoryObservationRepository,
  aStation,
  aSensor,
  anObservation,
  aMeasurement,
} from '@weather/test-support';
import { observationId } from '@weather/domain';

describe('FindDataGaps', () => {
  it('finds an outage in the ISS archive and ignores live polls', async () => {
    const stationRepo = new InMemoryStationRepository();
    const sensorRepo = new InMemorySensorRepository();
    const observationRepo = new InMemoryObservationRepository();
    const station = aStation({ registeredAt: new Date('2026-01-01T00:00:00Z') });
    const sensor = aSensor();
    await stationRepo.save(station);
    await sensorRepo.save(sensor);

    const at = (iso: string, source: 'historic' | 'current' = 'historic') =>
      anObservation({
        id: observationId(`${source}-${iso}`),
        stationId: station.id,
        sensorId: sensor.id,
        source,
        timestamp: new Date(iso),
        measurements: new Map([['temperature.outdoor', aMeasurement({ value: 5 })]]),
      });

    const obs = [];
    for (let h = 0; h < 24; h++) obs.push(at(`2026-01-01T${String(h).padStart(2, '0')}:00:00Z`));
    // 2 January missing from the archive, but live polling saw something
    obs.push(at('2026-01-02T12:00:00Z', 'current'));
    for (let h = 0; h < 24; h++) obs.push(at(`2026-01-03T${String(h).padStart(2, '0')}:00:00Z`));
    await observationRepo.saveMany(obs);

    const useCase = new FindDataGaps(stationRepo, sensorRepo, observationRepo, new FakeClock(new Date('2026-01-03T23:30:00Z')));
    const gaps = await useCase.execute();

    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.from.toISOString()).toBe('2026-01-01T23:00:00.000Z');
    expect(gaps[0]!.to.toISOString()).toBe('2026-01-03T00:00:00.000Z');
    expect(gaps[0]!.kind).toBe('no-data');
  });
});
