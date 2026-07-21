import Fastify from 'fastify';
import cors from '@fastify/cors';
import { EnvSchema } from '@weather/contracts';
import { SystemClock } from '@weather/domain';
import { createLogger, PrometheusMetrics, HealthChecker } from '@weather/observability';
import { WeatherLinkClient, WeatherLinkDataSource } from '@weather/weatherlink-adapter';
import { createDatabase, DrizzleStationRepository, DrizzleSensorRepository, DrizzleObservationRepository } from '@weather/persistence-adapter';
import { PollCurrentConditions, GetCurrentDashboard, DiscoverStations, SelectStation, GetSystemHealth } from '@weather/application';
import {
  registerStationRoutes,
  registerCurrentRoutes,
  registerHealthRoutes,
  registerMetricsRoutes,
  registerRequestLogging,
  registerErrorHandler,
} from '@weather/http-adapter';

const env = EnvSchema.parse(process.env);

const logger = createLogger({ level: env.LOG_LEVEL, name: 'api' });
const metrics = new PrometheusMetrics();
const clock = new SystemClock();

const { db, pool } = createDatabase(env.DATABASE_URL);

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

const pollCurrentConditions = new PollCurrentConditions(
  weatherSource, stationRepo, observationRepo, metrics, clock, logger,
);
const getCurrentDashboard = new GetCurrentDashboard(
  stationRepo, observationRepo, clock,
  { delayedAfterSeconds: env.CURRENT_DELAYED_AFTER_SECONDS, staleAfterSeconds: env.CURRENT_STALE_AFTER_SECONDS },
);
const discoverStations = new DiscoverStations(weatherSource, stationRepo, sensorRepo, logger);
const selectStation = new SelectStation(stationRepo, logger);

const healthChecker = new HealthChecker();
healthChecker.registerCheck('database', async () => {
  const start = Date.now();
  try {
    await pool.query('SELECT 1');
    return { name: 'database', status: 'up', latencyMs: Date.now() - start, message: null };
  } catch {
    return { name: 'database', status: 'down', latencyMs: Date.now() - start, message: 'Database connection failed' };
  }
});

const getSystemHealth = new GetSystemHealth(healthChecker);

const app = Fastify({ logger: false });

await app.register(cors, { origin: true });

registerRequestLogging(app, logger);
registerErrorHandler(app, logger);
registerStationRoutes(app, { stationRepo });
registerCurrentRoutes(app, { getCurrentDashboard });
registerHealthRoutes(app, { healthChecker });
registerMetricsRoutes(app, { metrics });

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Shutting down gracefully');
  await app.close();
  await pool.end();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

await app.listen({ port: env.PORT, host: '0.0.0.0' });
logger.info({ port: env.PORT }, 'API server started');
