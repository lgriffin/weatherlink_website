import type { SyncWindow } from '@weather/domain';
import { stationId, sensorId } from '@weather/domain';

export function aSyncWindow(overrides?: Partial<SyncWindow>): SyncWindow {
  return {
    stationId: stationId('station-1'),
    sensorId: sensorId('sensor-1'),
    startTimestamp: new Date('2026-07-17T00:00:00Z'),
    endTimestamp: new Date('2026-07-18T00:00:00Z'),
    syncedAt: new Date('2026-07-18T01:00:00Z'),
    observationCount: 96,
    ...overrides,
  };
}
