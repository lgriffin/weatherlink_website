import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import type { Env } from '@weather/contracts';
import { SystemClock } from '@weather/domain';
import { createLogger, PrometheusMetrics, HealthChecker } from '@weather/observability';
import { WeatherLinkClient, WeatherLinkDataSource } from '@weather/weatherlink-adapter';
import {
  createDatabase,
  migrateDatabase,
  DrizzleStationRepository,
  DrizzleSensorRepository,
  DrizzleObservationRepository,
  DrizzleDailySummaryRepository,
  DrizzleRecordRepository,
  DrizzleIngestReportRepository,
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
  GetAnnualStats,
  RecordIngestReport,
  GetIngestOverview,
} from '@weather/application';
import {
  registerStationRoutes,
  registerCurrentRoutes,
  registerRecordsRoutes,
  registerHistoryRoutes,
  registerCompareRoutes,
  registerAnnualRoutes,
  registerIngestRoutes,
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
  await migrateDatabase(db);

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
  const ingestReportRepo = new DrizzleIngestReportRepository(db);

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
  const getAnnualStats = new GetAnnualStats(stationRepo, dailySummaryRepo, clock, env.APP_TIMEZONE);
  const recordIngestReport = new RecordIngestReport(ingestReportRepo, clock);
  const getIngestOverview = new GetIngestOverview(ingestReportRepo);

  const app = Fastify({ logger: false });

  await app.register(cors, { origin: true });

  registerRequestLogging(app, logger);
  registerErrorHandler(app, logger);
  registerStationRoutes(app, { stationRepo });
  registerCurrentRoutes(app, { getCurrentDashboard });
  registerRecordsRoutes(app, { getRecords });
  registerHistoryRoutes(app, { getHistory });
  registerCompareRoutes(app, { getYearComparison });
  registerAnnualRoutes(app, { getAnnualStats });
  registerIngestRoutes(app, { recordIngestReport, getIngestOverview, ingestToken: env.INGEST_TOKEN });
  registerSeriesRoutes(app, { getTimeSeries });
  registerExportsRoutes(app, { exportData });
  registerHealthRoutes(app, { healthChecker });
  registerMetricsRoutes(app, { metrics });

  if (env.WEB_DIST_DIR) await serveWebApp(app, resolve(env.WEB_DIST_DIR));

  return { app, client, logger };
}

const API_PREFIXES = ['/api/', '/health', '/metrics'];

/**
 * Serve the built web app from the same server (the container does this), so
 * one port gives both the pages and the API. Unknown non-API paths get
 * index.html so deep links like /annual work on reload.
 */
async function serveWebApp(app: FastifyInstance, root: string): Promise<void> {
  if (!existsSync(resolve(root, 'index.html'))) {
    throw new Error(`WEB_DIST_DIR has no index.html: ${root} (run pnpm build first)`);
  }
  await app.register(fastifyStatic, { root, wildcard: false });
  app.setNotFoundHandler((request, reply) => {
    const path = request.url.split('?')[0]!;
    const isFile = /\.[a-z0-9]+$/i.test(path);
    if (request.method === 'GET' && !isFile && !API_PREFIXES.some((p) => path.startsWith(p))) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: { code: 'NOT_FOUND', message: `No route for ${request.method} ${path}` } });
  });
}
