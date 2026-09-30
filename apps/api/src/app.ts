import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { Env } from '@weather/contracts';
import { SystemClock } from '@weather/domain';
import { createLogger, PrometheusMetrics, HealthChecker } from '@weather/observability';
import { WeatherLinkClient, WeatherLinkDataSource } from '@weather/weatherlink-adapter';
import {
  createDatabase,
  DrizzleStationRepository,
  DrizzleSensorRepository,
  DrizzleObservationRepository,
  DrizzleDailySummaryRepository,
  DrizzleRecordRepository,
} from '@weather/persistence-adapter';
import {
  PollCurrentConditions,
  GetCurrentDashboard,
  DiscoverStations,
  SelectStation,
  GetSystemHealth,
  GetRecords,
  GetHistory,
  GetTimeSeries,
  ExportData,
  GetYearComparison,
} from '@weather/application';
import {
  registerStationRoutes,
  registerCurrentRoutes,
  registerRecordsRoutes,
  registerHistoryRoutes,
  registerCompareRoutes,
  registerSeriesRoutes,
  registerExportsRoutes,
  registerHealthRoutes,
  registerMetricsRoutes,
  registerRequestLogging,
  registerErrorHandler,
} from '@weather/http-adapter';

/** Composition root: wires every route to the database and WeatherLink. */
export async function buildApp(env: Env) {
  const logger = createLogger({ level: env.LOG_LEVEL, name: 'api' });
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
  const dailySummaryRepo = new DrizzleDailySummaryRepository(db);
  const recordRepo = new DrizzleRecordRepository(db);

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
      await client.execute('SELECT 1');
      return { name: 'database', status: 'up', latencyMs: Date.now() - start, message: null };
    } catch {
      return { name: 'database', status: 'down', latencyMs: Date.now() - start, message: 'Database connection failed' };
    }
  });

  const getSystemHealth = new GetSystemHealth(healthChecker);
  const getRecords = new GetRecords(stationRepo, recordRepo);
  const getHistory = new GetHistory(stationRepo, dailySummaryRepo);
  const getTimeSeries = new GetTimeSeries(stationRepo, observationRepo, dailySummaryRepo);
  const exportData = new ExportData(stationRepo, observationRepo);
  const getYearComparison = new GetYearComparison(stationRepo, dailySummaryRepo, clock, env.APP_TIMEZONE);

  const app = Fastify({ logger: false });

  await app.register(cors, { origin: true });

  registerRequestLogging(app, logger);
  registerErrorHandler(app, logger);
  registerStationRoutes(app, { stationRepo });
  registerCurrentRoutes(app, { getCurrentDashboard });
  registerRecordsRoutes(app, { getRecords });
  registerHistoryRoutes(app, { getHistory });
  registerCompareRoutes(app, { getYearComparison });
  registerSeriesRoutes(app, { getTimeSeries });
  registerExportsRoutes(app, { exportData });
  registerHealthRoutes(app, { healthChecker });
  registerMetricsRoutes(app, { metrics });

  return { app, client, logger };
}
