import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { MeasurementName } from '@weather/domain';
import { aStation, aSensor, anArchiveRecord, aDailySummary } from '@weather/test-support';
import { FileHistoryStore } from './file-history-store.js';

describe('FileHistoryStore', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'history-'));
  });

  it('round-trips a day of raw records and skips unchanged writes', async () => {
    const store = new FileHistoryStore(root);
    const station = aStation();
    const records = [
      anArchiveRecord({ timestamp: new Date('2024-02-01T00:15:00Z'), payload: { wind_speed_avg: 4 } }),
      anArchiveRecord({ timestamp: new Date('2024-02-01T00:00:00Z'), intervalMinutes: null }),
    ];

    expect(await store.writeArchiveDay(station.id, '2024-02-01', records)).toBe(true);
    expect(await store.writeArchiveDay(station.id, '2024-02-01', [...records].reverse())).toBe(false);

    expect(await store.listArchiveDays(station.id)).toEqual(['2024-02-01']);
    const back = await store.readArchiveDay(station.id, '2024-02-01');
    expect(back.map((r) => r.timestamp.toISOString())).toEqual(['2024-02-01T00:00:00.000Z', '2024-02-01T00:15:00.000Z']);
    expect(back[0]).toEqual({ ...records[1], stationId: station.id });
    expect(back[1]!.payload).toEqual({ wind_speed_avg: 4 });
  });

  it('keeps the station and sensors but leaves out coordinates by default', async () => {
    const store = new FileHistoryStore(root);
    const station = aStation();
    const window = {
      stationId: station.id, sensorId: aSensor().id, startTimestamp: new Date('2024-02-01T00:00:00Z'),
      endTimestamp: new Date('2024-02-02T00:00:00Z'), syncedAt: new Date('2024-02-02T01:00:00Z'), observationCount: 96,
    };
    await store.writeStation({ station, sensors: [aSensor()], syncWindows: [window] });

    expect(await store.listStations()).toEqual([station.id]);
    const back = await store.readStation(station.id);
    expect(back?.station).toEqual({ ...station, latitude: null, longitude: null });
    expect(back?.sensors).toEqual([aSensor()]);
    expect(back?.syncWindows).toEqual([window]);
    expect(JSON.parse(await readFile(join(root, 'format.json'), 'utf8'))).toMatchObject({ version: 1 });
  });

  it('writes daily summaries as CSV with empty cells for missing values', async () => {
    const store = new FileHistoryStore(root);
    await store.writeDailySummaries(aStation().id, '2024-02', [
      aDailySummary({ date: '2024-02-02', measurementName: 'rain.daily' as MeasurementName, unit: 'mm', min: null, max: 4.2, avg: null, count: 96 }),
      aDailySummary({ date: '2024-02-01', measurementName: 'temperature.outdoor' as MeasurementName, unit: 'celsius', min: 1.25, max: 9.1, avg: 5.333333, count: 96 }),
    ]);
    const csv = await readFile(join(root, 'stations', 'station-1', 'daily', '2024', '2024-02.csv'), 'utf8');
    expect(csv.split('\n')).toEqual([
      'date,measurement,unit,min,max,avg,count',
      '2024-02-01,temperature.outdoor,celsius,1.25,9.1,5.333,96',
      '2024-02-02,rain.daily,mm,,4.2,,96',
      '',
    ]);
  });

  it('refuses a folder written by a newer format', async () => {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(root, 'format.json'), JSON.stringify({ version: 99 }));
    await expect(new FileHistoryStore(root).listStations()).rejects.toThrow(/version 99/);
  });
});
