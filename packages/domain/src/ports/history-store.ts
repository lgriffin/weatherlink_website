import type { StationId } from '../types/ids.js';
import type { WeatherStation } from '../types/station.js';
import type { Sensor } from '../types/sensor.js';
import type { SyncWindow } from '../types/sync-window.js';
import type { ArchiveRecord } from '../types/archive-record.js';
import type { DailySummary } from '../types/daily-summary.js';

/** What a store keeps about a station besides its readings. */
export interface StoredStation {
  readonly station: WeatherStation;
  readonly sensors: Sensor[];
  /** Download windows already covered, so a restored database doesn't re-download them. */
  readonly syncWindows: SyncWindow[];
}

/**
 * Long-term home for the station's history, outside the working database:
 * a git branch, a NAS share, a synced Google Drive folder, a bucket. The raw
 * archive (one file per UTC day) is the source of truth; everything else can
 * be re-derived from it. Writes are idempotent and report whether anything
 * changed, so unchanged days cost nothing.
 */
export interface HistoryStore {
  listStations(): Promise<StationId[]>;
  readStation(stationId: StationId): Promise<StoredStation | null>;
  writeStation(stored: StoredStation): Promise<boolean>;

  /** UTC days (YYYY-MM-DD) with a stored archive file. */
  listArchiveDays(stationId: StationId): Promise<string[]>;
  readArchiveDay(stationId: StationId, date: string): Promise<ArchiveRecord[]>;
  writeArchiveDay(stationId: StationId, date: string, records: readonly ArchiveRecord[]): Promise<boolean>;

  /** Daily summaries for one local month (YYYY-MM), for spreadsheets and quick looks. */
  writeDailySummaries(stationId: StationId, month: string, summaries: readonly DailySummary[]): Promise<boolean>;
}
