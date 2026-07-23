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
} from '@weather/application';
import type { AlertRule, Observation } from '@weather/domain';

const env = EnvSchema.parse(process.env);

const logger = createLogger({ level: env.LOG_LEVEL, name: 'worker' });
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

const discoverStations = new DiscoverStations(weatherSource, stationRepo, sensorRepo, logger);
const pollCurrentConditions = new PollCurrentConditions(
  weatherSource, stationRepo, observationRepo, metrics, clock, logger,
);
const syncHistoricData = new SyncHistoricData(
  weatherSource, stationRepo, sensorRepo, observationRepo, syncWindowRepo, clock, logger,
);
const backfillHistoricData = new BackfillHistoricData(
  weatherSource, stationRepo, sensorRepo, observationRepo, syncWindowRepo, clock, logger,
  env.HISTORIC_BACKFILL_DAYS,
);
const computeDailySummaries = new ComputeDailySummaries(
  stationRepo, observationRepo, dailySummaryRepo, logger,
);
const computeRecords = new ComputeRecords(
  stationRepo, dailySummaryRepo, recordRepo, logger,
);

const alertRules: AlertRule[] = JSON.parse(env.ALERT_RULES_JSON);
const evaluateAlerts = new EvaluateAlerts(alertRules, logger);

const cleanupOldData = new CleanupOldData(
  observationRepo,
  dailySummaryRepo,
  { observationMaxAgeDays: env.RETENTION_OBSERVATION_MAX_AGE_DAYS, summaryMaxAgeDays: env.RETENTION_SUMMARY_MAX_AGE_DAYS },
  clock,
  logger,
);

logger.info('Starting station discovery');
try {
  await discoverStations.execute();
} catch (error) {
  logger.error({ err: error }, 'Station discovery failed');
}

let lastSummaryDate = '';

async function poll(): Promise<void> {
  let observations: Observation[] = [];
  try {
    observations = await pollCurrentConditions.execute();
  } catch (error) {
    logger.error({ err: error }, 'Poll cycle failed');
  }

  if (observations.length > 0 && alertRules.length > 0) {
    try {
      evaluateAlerts.execute(observations);
    } catch (error) {
      logger.error({ err: error }, 'Alert evaluation failed');
    }
  }

  const yesterday = new Date(clock.now().getTime() - 86400000).toISOString().substring(0, 10);

  if (lastSummaryDate !== yesterday) {
    try {
      await computeDailySummaries.execute(yesterday);
      await computeRecords.execute();
      lastSummaryDate = yesterday;
    } catch (error) {
      logger.error({ err: error }, 'Daily summary/records computation failed');
    }
  }
}

logger.info('Starting initial backfill');
try {
  await backfillHistoricData.execute();
} catch (error) {
  logger.error({ err: error }, 'Initial backfill failed');
}

await poll();

const pollIntervalMs = env.CURRENT_POLL_INTERVAL_MS;
logger.info({ pollIntervalMs }, 'Starting poll loop');
const timer = setInterval(poll, pollIntervalMs);

const historicSyncIntervalMs = env.HISTORIC_SYNC_INTERVAL_MS;
logger.info({ historicSyncIntervalMs }, 'Starting historic sync loop');
const historicTimer = setInterval(async () => {
  try {
    await syncHistoricData.execute();
  } catch (error) {
    logger.error({ err: error }, 'Historic sync failed');
  }
}, historicSyncIntervalMs);

const cleanupIntervalMs = env.CLEANUP_INTERVAL_MS;
logger.info({ cleanupIntervalMs }, 'Starting cleanup loop');
const cleanupTimer = setInterval(async () => {
  try {
    await cleanupOldData.execute();
  } catch (error) {
    logger.error({ err: error }, 'Data cleanup failed');
  }
}, cleanupIntervalMs);

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Worker shutting down');
  clearInterval(timer);
  clearInterval(historicTimer);
  clearInterval(cleanupTimer);
  client.close();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
