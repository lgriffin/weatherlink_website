import type {
  ArchiveRecordRepository,
  Clock,
  DailySummary,
  DailySummaryRepository,
  HistoryStore,
  SensorRepository,
  StationRepository,
  SyncWindowRepository,
} from '@weather/domain';
import { addDays, localDateOf } from '@weather/domain';
import type { Logger } from '@weather/observability';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface ExportHistoryOptions {
  /** Re-check every stored day, not just the most recent few. */
  readonly all?: boolean;
  /** Stored days this close to today are re-checked, since late records can still arrive. */
  readonly recheckDays?: number;
}

export interface ExportHistoryResult {
  readonly daysWritten: number;
  readonly daysUnchanged: number;
  readonly daysSkipped: number;
  readonly monthsWritten: number;
  readonly stationChanged: boolean;
}

function utcDate(ms: number): string {
  return new Date(ms).toISOString().substring(0, 10);
}

/**
 * Copies the database's raw archive, daily summaries and download windows
 * into a history store. Only whole UTC days before today go out, so each
 * day's file is written once and then left alone.
 */
export class ExportHistory {
  constructor(
    private readonly stationRepo: StationRepository,
    private readonly sensorRepo: SensorRepository,
    private readonly syncWindowRepo: SyncWindowRepository,
    private readonly archiveRepo: ArchiveRecordRepository,
    private readonly dailySummaryRepo: DailySummaryRepository,
    private readonly store: HistoryStore,
    private readonly clock: Clock,
    private readonly logger: Logger,
    private readonly timeZone: string = 'UTC',
  ) {}

  async execute(options: ExportHistoryOptions = {}): Promise<ExportHistoryResult> {
    const result = { daysWritten: 0, daysUnchanged: 0, daysSkipped: 0, monthsWritten: 0, stationChanged: false };
    const station = await this.stationRepo.findActive();
    if (!station) {
      this.logger.warn('No active station, nothing to export');
      return result;
    }

    const now = this.clock.now();
    const cutoff = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const recheckFrom = utcDate(cutoff - (options.recheckDays ?? 3) * ONE_DAY_MS);

    const sensors = await this.sensorRepo.findByStationId(station.id);
    const windows = (await Promise.all(
      sensors.map((s) => this.syncWindowRepo.findByStationAndSensor(station.id, s.id)),
    )).flat().filter((w) => w.endTimestamp.getTime() <= cutoff);
    result.stationChanged = await this.store.writeStation({ station, sensors, syncWindows: windows });

    const bounds = await this.archiveRepo.findTimeBounds(station.id);
    if (bounds) {
      const stored = new Set(await this.store.listArchiveDays(station.id));
      const first = Date.parse(`${utcDate(bounds.earliest.getTime())}T00:00:00Z`);
      for (let start = first; start < cutoff; start += ONE_DAY_MS) {
        const date = utcDate(start);
        if (stored.has(date) && !options.all && date < recheckFrom) {
          result.daysSkipped++;
          continue;
        }
        const records = await this.archiveRepo.findByStationAndTimeRange(
          station.id, new Date(start), new Date(start + ONE_DAY_MS),
        );
        if (records.length === 0) continue;
        if (await this.store.writeArchiveDay(station.id, date, records)) result.daysWritten++;
        else result.daysUnchanged++;
      }
    }

    // Summaries up to yesterday (local), one file per month.
    const lastDay = addDays(localDateOf(now, this.timeZone), -1);
    const summaries = await this.dailySummaryRepo.findByStationAndDateRange(station.id, '1900-01-01', lastDay);
    const byMonth = new Map<string, DailySummary[]>();
    for (const s of summaries) {
      const month = s.date.substring(0, 7);
      const list = byMonth.get(month) ?? [];
      list.push(s);
      byMonth.set(month, list);
    }
    for (const [month, list] of byMonth) {
      if (await this.store.writeDailySummaries(station.id, month, list)) result.monthsWritten++;
    }

    this.logger.info(result, 'History export finished');
    return result;
  }
}
