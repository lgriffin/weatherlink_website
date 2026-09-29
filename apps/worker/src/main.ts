import type { Observation } from '@weather/domain';
import { addDays, localDateOf } from '@weather/domain';
import { localDateCandidates } from '@weather/application';
import { composeWorker } from './compose.js';

const {
  env,
  logger,
  clock,
  client,
  stationRepo,
  observationRepo,
  dailySummaryRepo,
  alertRules,
  discoverStations,
  pollCurrentConditions,
  syncHistoricData,
  backfillHistoricData,
  computeDailySummaries,
  computeRecords,
  evaluateAlerts,
  cleanupOldData,
} = await composeWorker('worker');

function localYesterday(): string {
  return addDays(localDateOf(clock.now(), env.APP_TIMEZONE), -1);
}

async function backfillSummaries(): Promise<void> {
  const station = await stationRepo.findActive();
  if (!station) return;

  const obsDates = await observationRepo.findDistinctDatesByStation(station.id);
  const summaryDates = new Set(await dailySummaryRepo.findDistinctDatesByStation(station.id));

  const today = localDateOf(clock.now(), env.APP_TIMEZONE);
  const missingDates = localDateCandidates(obsDates, today).filter((d) => !summaryDates.has(d));

  if (missingDates.length === 0) return;

  // Candidates include neighbouring days that may turn out to be empty, so only
  // recompute records when a summary was actually written.
  let datesSummarised = 0;
  for (const date of missingDates) {
    try {
      if ((await computeDailySummaries.execute(date)) > 0) datesSummarised++;
    } catch (error) {
      logger.error({ err: error, date }, 'Failed to compute summary for date');
    }
  }

  if (datesSummarised === 0) return;

  await computeRecords.execute();
  logger.info({ datesSummarised }, 'Summary backfill complete, records recomputed');
}

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

  const yesterday = localYesterday();

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

try {
  await backfillSummaries();
} catch (error) {
  logger.error({ err: error }, 'Summary backfill failed');
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
    await backfillSummaries();
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
