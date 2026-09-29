import type { ArchiveRecord } from '@weather/domain';
import { stationId, sensorId } from '@weather/domain';

/** Payload uses the fake data source's format: canonical measurement name to value. */
export function anArchiveRecord(overrides?: Partial<ArchiveRecord>): ArchiveRecord {
  return {
    stationId: stationId('station-1'),
    sensorId: sensorId('sensor-1'),
    sensorType: 45,
    timestamp: new Date('2026-07-17T14:00:00Z'),
    intervalMinutes: 15,
    payload: { 'temperature.outdoor': 18.5 },
    fetchedAt: new Date('2026-07-18T00:00:00Z'),
    ...overrides,
  };
}
