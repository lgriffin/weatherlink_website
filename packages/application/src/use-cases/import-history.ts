import type {
  ArchiveRecordRepository,
  HistoryStore,
  SensorRepository,
  StationRepository,
  SyncWindowRepository,
} from '@weather/domain';
import type { Logger } from '@weather/observability';

export interface ImportHistoryResult {
  readonly stations: number;
  readonly days: number;
  readonly records: number;
  readonly syncWindows: number;
}

/**
 * Loads a history store into the database: stations and sensors it doesn't
 * know yet, the raw archive, and the download windows (so a harvest carries
 * on from where the history ends instead of starting again). Run
 * `archive rebuild` afterwards to derive observations and summaries.
 */
export class ImportHistory {
  constructor(
    private readonly stationRepo: StationRepository,
    private readonly sensorRepo: SensorRepository,
    private readonly syncWindowRepo: SyncWindowRepository,
    private readonly archiveRepo: ArchiveRecordRepository,
    private readonly store: HistoryStore,
    private readonly logger: Logger,
  ) {}

  async execute(): Promise<ImportHistoryResult> {
    const result = { stations: 0, days: 0, records: 0, syncWindows: 0 };
    const hasActive = (await this.stationRepo.findActive()) !== null;

    for (const id of await this.store.listStations()) {
      const stored = await this.store.readStation(id);
      if (!stored) continue;
      result.stations++;

      if (!(await this.stationRepo.findById(id))) {
        await this.stationRepo.save({ ...stored.station, isActive: stored.station.isActive && !hasActive });
      }
      for (const sensor of stored.sensors) {
        if (!(await this.sensorRepo.findById(sensor.id))) await this.sensorRepo.save(sensor);
      }

      for (const date of await this.store.listArchiveDays(id)) {
        const records = await this.store.readArchiveDay(id, date);
        if (records.length === 0) continue;
        await this.archiveRepo.saveMany(records);
        result.days++;
        result.records += records.length;
        if (result.days % 100 === 0) this.logger.info({ ...result, date }, 'Import progress');
      }

      // Windows last, so they are only claimed once the records are in.
      for (const w of stored.syncWindows) {
        const gaps = await this.syncWindowRepo.findGaps(id, w.sensorId, w.startTimestamp, w.endTimestamp);
        if (gaps.length === 0) continue;
        await this.syncWindowRepo.save(w);
        result.syncWindows++;
      }
    }

    this.logger.info(result, 'History import finished');
    return result;
  }
}
