import { EnvSchema } from '@weather/contracts';
import { SystemClock } from '@weather/domain';
import { createLogger, PrometheusMetrics } from '@weather/observability';
import { WeatherLinkClient, WeatherLinkDataSource } from '@weather/weatherlink-adapter';
import {
  createDatabase,
  DrizzleStationRepository,
  DrizzleSensorRepository,
  DrizzleObservationRepository,
  DrizzleSyncWindowRepository,
  DrizzleDailySummaryRepository,
  DrizzleRecordRepository,
  DrizzleArchiveRecordRepository,
  DrizzleIngestReportRepository,
} from '@weather/persistence-adapter';
import {
  PollCurrentConditions,
  DiscoverStations,
  SyncHistoricData,
  BackfillHistoricData,
  ComputeDailySummaries,
  ComputeRecords,
  EvaluateAlerts,
  CleanupOldData,
  ArchiveIngestor,
  HarvestFullArchive,
  RebuildFromArchive,
  FindDataGaps,
  RecordIngestReport,
} from '@weather/application';
import type { AlertRule } from '@weather/domain';

/** Composition root shared by the poller and the archive command line. */
export async function composeWorker(name: string) {
  const env = EnvSchema.parse(process.env);

  const logger = createLogger({ level: env.LOG_LEVEL, name });
  const metrics = new PrometheusMetrics();
  const clock = new SystemClock();

  const { db, client } = await createDatabase(env.DATABASE_PATH);

  const weatherLinkClient = new WeatherLinkClient(
    env.WEATHERLINK_API_KEY,
    env.WEATHERLINK_API_SECRET,
    env.WEATHERLINK_BASE_URL,
    logger,
  );
  const weatherSource = new WeatherLinkDataSource(weatherLinkClient, logger);

  const stationRepo = new DrizzleStationRepository(db);
  const sensorRepo = new DrizzleSensorRepository(db);
  const observationRepo = new DrizzleObservationRepository(db);
  const syncWindowRepo = new DrizzleSyncWindowRepository(db);
  const dailySummaryRepo = new DrizzleDailySummaryRepository(db);
  const recordRepo = new DrizzleRecordRepository(db);
  const archiveRepo = new DrizzleArchiveRecordRepository(db);

  const ingestor = new ArchiveIngestor(weatherSource, archiveRepo, observationRepo, syncWindowRepo, clock);

  const discoverStations = new DiscoverStations(weatherSource, stationRepo, sensorRepo, logger);
  const pollCurrentConditions = new PollCurrentConditions(
    weatherSource, stationRepo, observationRepo, metrics, clock, logger,
  );
  const syncHistoricData = new SyncHistoricData(
    ingestor, stationRepo, sensorRepo, syncWindowRepo, clock, logger,
  );
  const backfillHistoricData = new BackfillHistoricData(
    ingestor, stationRepo, sensorRepo, syncWindowRepo, clock, logger,
    env.HISTORIC_BACKFILL_DAYS,
  );
  const computeDailySummaries = new ComputeDailySummaries(
    stationRepo, observationRepo, dailySummaryRepo, logger, env.APP_TIMEZONE,
  );
  const computeRecords = new ComputeRecords(
    stationRepo, dailySummaryRepo, recordRepo, logger,
  );
  const harvestFullArchive = new HarvestFullArchive(
    ingestor, stationRepo, sensorRepo, syncWindowRepo, clock, logger,
  );
  const rebuildFromArchive = new RebuildFromArchive(
    weatherSource, stationRepo, archiveRepo, observationRepo, dailySummaryRepo,
    computeDailySummaries, computeRecords, clock, logger, env.APP_TIMEZONE,
  );

  const findDataGaps = new FindDataGaps(stationRepo, sensorRepo, observationRepo, clock);
  const recordIngestReport = new RecordIngestReport(new DrizzleIngestReportRepository(db), clock);

  const alertRules: AlertRule[] = JSON.parse(env.ALERT_RULES_JSON);
  const evaluateAlerts = new EvaluateAlerts(alertRules, logger);

  const cleanupOldData = new CleanupOldData(
    observationRepo,
    dailySummaryRepo,
    { observationMaxAgeDays: env.RETENTION_OBSERVATION_MAX_AGE_DAYS, summaryMaxAgeDays: env.RETENTION_SUMMARY_MAX_AGE_DAYS },
    clock,
    logger,
  );

  return {
    env,
    logger,
    clock,
    client,
    stationRepo,
    observationRepo,
    dailySummaryRepo,
    archiveRepo,
    alertRules,
    discoverStations,
    pollCurrentConditions,
    syncHistoricData,
    backfillHistoricData,
    computeDailySummaries,
    computeRecords,
    harvestFullArchive,
    rebuildFromArchive,
    findDataGaps,
    recordIngestReport,
    evaluateAlerts,
    cleanupOldData,
  };
}
