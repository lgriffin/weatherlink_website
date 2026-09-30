import { describe, it, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileHistoryStore } from '@weather/history-store';
import { createLogger } from '@weather/observability';
import type { MeasurementName } from '@weather/domain';
import {
  FakeClock,
  InMemoryStationRepository,
  InMemorySensorRepository,
  InMemorySyncWindowRepository,
  InMemoryArchiveRecordRepository,
  InMemoryDailySummaryRepository,
  aStation,
  aSensor,
  anArchiveRecord,
  aDailySummary,
} from '@weather/test-support';
import { ExportHistory } from './export-history.js';
import { ImportHistory } from './import-history.js';

const logger = createLogger({ level: 'silent', name: 'test' });

function repos() {
  return {
    stations: new InMemoryStationRepository(),
    sensors: new InMemorySensorRepository(),
    windows: new InMemorySyncWindowRepository(),
    archive: new InMemoryArchiveRecordRepository(),
    summaries: new InMemoryDailySummaryRepository(),
  };
}

describe('ExportHistory and ImportHistory', () => {
  it('moves the whole history to a fresh database through the store', async () => {
    const root = await mkdtemp(join(tmpdir(), 'history-'));
    const store = new FileHistoryStore(root);
    const clock = new FakeClock(new Date('2024-02-03T10:00:00Z'));
    const src = repos();
    const station = aStation();
    await src.stations.save(station);
    await src.sensors.save(aSensor());
    await src.windows.save({
      stationId: station.id, sensorId: aSensor().id, startTimestamp: new Date('2024-02-01T00:00:00Z'),
      endTimestamp: new Date('2024-02-02T00:00:00Z'), syncedAt: new Date('2024-02-02T01:00:00Z'), observationCount: 2,
    });
    await src.archive.saveMany([
      anArchiveRecord({ timestamp: new Date('2024-02-01T09:00:00Z') }),
      anArchiveRecord({ timestamp: new Date('2024-02-02T09:00:00Z') }),
      // Today is not finished, so it stays out.
      anArchiveRecord({ timestamp: new Date('2024-02-03T09:00:00Z') }),
    ]);
    await src.summaries.save(aDailySummary({ date: '2024-02-01', measurementName: 'temperature.outdoor' as MeasurementName }));

    const exporter = new ExportHistory(src.stations, src.sensors, src.windows, src.archive, src.summaries, store, clock, logger, 'Europe/Dublin');
    const first = await exporter.execute();
    expect(first).toMatchObject({ daysWritten: 2, monthsWritten: 1, stationChanged: true });
    expect(await store.listArchiveDays(station.id)).toEqual(['2024-02-01', '2024-02-02']);

    // Nothing changed: nothing is rewritten.
    const again = await exporter.execute();
    expect(again).toMatchObject({ daysWritten: 0, monthsWritten: 0, stationChanged: false });

    const dst = repos();
    const imported = await new ImportHistory(dst.stations, dst.sensors, dst.windows, dst.archive, store, logger).execute();
    expect(imported).toEqual({ stations: 1, days: 2, records: 2, syncWindows: 1 });
    expect(await dst.archive.countByStation(station.id)).toBe(2);
    expect((await dst.stations.findActive())?.name).toBe(station.name);
    expect(await dst.sensors.findById(aSensor().id)).not.toBeNull();

    // Importing twice doesn't duplicate download windows.
    const twice = await new ImportHistory(dst.stations, dst.sensors, dst.windows, dst.archive, store, logger).execute();
    expect(twice.syncWindows).toBe(0);
  });
});
