import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import type {
  ArchiveRecord,
  DailySummary,
  HistoryStore,
  StationId,
  StoredStation,
} from '@weather/domain';
import { sensorId, stationId } from '@weather/domain';
import { FORMAT_README } from './format-readme.js';

export const HISTORY_FORMAT_VERSION = 1;

export interface FileHistoryStoreOptions {
  /**
   * Keep the station's latitude and longitude in station.json. Off by default
   * because the store is often a public git branch.
   */
  readonly includeLocation?: boolean;
}

/**
 * The history as plain files in a folder: a git checkout, a NAS share or a
 * synced Google Drive folder all work the same way. Layout:
 *
 *   format.json, README.md
 *   stations/<id>/station.json                     station, sensors
 *   stations/<id>/sync-windows.json                download windows already covered
 *   stations/<id>/archive/YYYY/MM/YYYY-MM-DD.ndjson.gz   raw archive, one record per line (UTC day)
 *   stations/<id>/daily/YYYY/YYYY-MM.csv           daily summaries (local days)
 */
export class FileHistoryStore implements HistoryStore {
  constructor(
    private readonly root: string,
    private readonly options: FileHistoryStoreOptions = {},
  ) {}

  private stationDir(id: StationId): string {
    const safe = String(id).replace(/[^A-Za-z0-9_-]/g, '_');
    return join(this.root, 'stations', safe);
  }

  private archivePath(id: StationId, date: string): string {
    return join(this.stationDir(id), 'archive', date.substring(0, 4), date.substring(5, 7), `${date}.ndjson.gz`);
  }

  /** Write only when the content differs, via a temp file so a crash never leaves half a file. */
  private async put(path: string, content: string, gzip = false): Promise<boolean> {
    const existing = await readFile(path).catch(() => null);
    if (existing) {
      const text = gzip ? gunzipSync(existing).toString('utf8') : existing.toString('utf8');
      if (text === content) return false;
    }
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    await writeFile(tmp, gzip ? gzipSync(content, { level: 9 }) : content);
    await rename(tmp, path);
    return true;
  }

  private async ensureFormat(): Promise<void> {
    await this.put(join(this.root, 'format.json'),
      `${JSON.stringify({ format: 'weatherlink-history', version: HISTORY_FORMAT_VERSION }, null, 2)}\n`);
    await this.put(join(this.root, 'README.md'), FORMAT_README);
  }

  private async checkFormat(): Promise<void> {
    const raw = await readFile(join(this.root, 'format.json'), 'utf8').catch(() => null);
    if (!raw) return;
    const { version } = JSON.parse(raw) as { version?: number };
    if (version !== undefined && version > HISTORY_FORMAT_VERSION) {
      throw new Error(`History folder uses format version ${version}; this code reads up to ${HISTORY_FORMAT_VERSION}.`);
    }
  }

  async listStations(): Promise<StationId[]> {
    await this.checkFormat();
    const entries = await readdir(join(this.root, 'stations'), { withFileTypes: true }).catch(() => []);
    const ids: StationId[] = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const raw = await readFile(join(this.root, 'stations', e.name, 'station.json'), 'utf8').catch(() => null);
      if (raw) ids.push(stationId((JSON.parse(raw) as { station: { id: string } }).station.id));
    }
    return ids.sort();
  }

  async readStation(id: StationId): Promise<StoredStation | null> {
    const dir = this.stationDir(id);
    const raw = await readFile(join(dir, 'station.json'), 'utf8').catch(() => null);
    if (!raw) return null;
    const { station, sensors } = JSON.parse(raw) as {
      station: Record<string, unknown>;
      sensors: Array<Record<string, unknown>>;
    };
    const windowsRaw = await readFile(join(dir, 'sync-windows.json'), 'utf8').catch(() => '[]');
    const windows = JSON.parse(windowsRaw) as Array<Record<string, unknown>>;
    return {
      station: {
        id: stationId(String(station['id'])),
        weatherLinkStationId: Number(station['weatherLinkStationId']),
        name: String(station['name']),
        timezone: String(station['timezone']),
        latitude: (station['latitude'] as number | null | undefined) ?? null,
        longitude: (station['longitude'] as number | null | undefined) ?? null,
        elevationMetres: (station['elevationMetres'] as number | null | undefined) ?? null,
        isActive: Boolean(station['isActive']),
        registeredAt: new Date(String(station['registeredAt'])),
        updatedAt: new Date(String(station['updatedAt'])),
      },
      sensors: sensors.map((s) => ({
        id: sensorId(String(s['id'])),
        stationId: stationId(String(s['stationId'])),
        lsid: Number(s['lsid']),
        sensorType: Number(s['sensorType']),
        dataStructureType: (s['dataStructureType'] as number | null | undefined) ?? null,
        name: String(s['name']),
        category: s['category'] as StoredStation['sensors'][number]['category'],
        capabilities: (s['capabilities'] as string[] | undefined) ?? [],
        isActive: Boolean(s['isActive']),
      })),
      syncWindows: windows.map((w) => ({
        stationId: stationId(String(w['stationId'])),
        sensorId: sensorId(String(w['sensorId'])),
        startTimestamp: new Date(String(w['startTimestamp'])),
        endTimestamp: new Date(String(w['endTimestamp'])),
        syncedAt: new Date(String(w['syncedAt'])),
        observationCount: Number(w['observationCount']),
      })),
    };
  }

  async writeStation(stored: StoredStation): Promise<boolean> {
    await this.ensureFormat();
    const dir = this.stationDir(stored.station.id);
    const station = this.options.includeLocation
      ? stored.station
      : { ...stored.station, latitude: null, longitude: null };
    const sensors = [...stored.sensors].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const windows = [...stored.syncWindows].sort((a, b) =>
      a.startTimestamp.getTime() - b.startTimestamp.getTime() || String(a.sensorId).localeCompare(String(b.sensorId)));
    const a = await this.put(join(dir, 'station.json'), `${JSON.stringify({ station, sensors }, null, 2)}\n`);
    const b = await this.put(join(dir, 'sync-windows.json'), `${JSON.stringify(windows, null, 1)}\n`);
    return a || b;
  }

  async listArchiveDays(id: StationId): Promise<string[]> {
    const base = join(this.stationDir(id), 'archive');
    const files = await readdir(base, { recursive: true }).catch(() => [] as string[]);
    return files
      .map((f) => /(\d{4}-\d{2}-\d{2})\.ndjson\.gz$/.exec(String(f))?.[1])
      .filter((d): d is string => d !== undefined)
      .sort();
  }

  async readArchiveDay(id: StationId, date: string): Promise<ArchiveRecord[]> {
    const buf = await readFile(this.archivePath(id, date)).catch(() => null);
    if (!buf) return [];
    return gunzipSync(buf).toString('utf8').split('\n').filter(Boolean).map((line) => {
      const r = JSON.parse(line) as Record<string, unknown>;
      return {
        stationId: id,
        sensorId: sensorId(String(r['sensorId'])),
        sensorType: Number(r['sensorType']),
        timestamp: new Date(String(r['timestamp'])),
        intervalMinutes: (r['intervalMinutes'] as number | null | undefined) ?? null,
        payload: r['payload'],
        fetchedAt: new Date(String(r['fetchedAt'])),
      };
    });
  }

  async writeArchiveDay(id: StationId, date: string, records: readonly ArchiveRecord[]): Promise<boolean> {
    const lines = [...records]
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime() || String(a.sensorId).localeCompare(String(b.sensorId)))
      .map((r) => JSON.stringify({
        sensorId: String(r.sensorId),
        sensorType: r.sensorType,
        timestamp: r.timestamp.toISOString(),
        intervalMinutes: r.intervalMinutes,
        fetchedAt: r.fetchedAt.toISOString(),
        payload: r.payload,
      }));
    return this.put(this.archivePath(id, date), lines.map((l) => `${l}\n`).join(''), true);
  }

  async writeDailySummaries(id: StationId, month: string, summaries: readonly DailySummary[]): Promise<boolean> {
    const rows = [...summaries]
      .sort((a, b) => a.date.localeCompare(b.date) || a.measurementName.localeCompare(b.measurementName))
      .map((s) => [s.date, s.measurementName, s.unit, num(s.min), num(s.max), num(s.avg), String(s.count)].join(','));
    const csv = ['date,measurement,unit,min,max,avg,count', ...rows].join('\n') + '\n';
    return this.put(join(this.stationDir(id), 'daily', month.substring(0, 4), `${month}.csv`), csv);
  }
}

/** Empty for missing (never zero), trimmed float noise otherwise. */
function num(value: number | null): string {
  return value === null ? '' : String(Math.round(value * 1000) / 1000);
}
