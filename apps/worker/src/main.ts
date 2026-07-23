import { EnvSchema } from '@weather/contracts';
import { SystemClock } from '@weather/domain';
import { createLogger, PrometheusMetrics } from '@weather/observability';
import { WeatherLinkClient, WeatherLinkDataSource } from '@weather/weatherlink-adapter';
import {
  createDatabase,
  DrizzleStationRepository,
  DrizzleSensorRepository,
  DrizzleObservationRepository,
} from '@weather/persistence-adapter';
import { PollCurrentConditions, DiscoverStations } from '@weather/application';

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

const discoverStations = new DiscoverStations(weatherSource, stationRepo, sensorRepo, logger);
const pollCurrentConditions = new PollCurrentConditions(
  weatherSource, stationRepo, observationRepo, metrics, clock, logger,
);

logger.info('Starting station discovery');
try {
  await discoverStations.execute();
} catch (error) {
  logger.error({ err: error }, 'Station discovery failed');
}

async function poll(): Promise<void> {
  try {
    await pollCurrentConditions.execute();
  } catch (error) {
    logger.error({ err: error }, 'Poll cycle failed');
  }
}

await poll();

const pollIntervalMs = env.CURRENT_POLL_INTERVAL_MS;
logger.info({ pollIntervalMs }, 'Starting poll loop');
const timer = setInterval(poll, pollIntervalMs);

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Worker shutting down');
  clearInterval(timer);
  client.close();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
