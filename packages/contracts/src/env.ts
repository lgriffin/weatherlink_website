import { z } from 'zod';

/** An empty line in .env (`INGEST_TOKEN=`) means "not set". */
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

export const EnvSchema = z.object({
  WEATHERLINK_API_KEY: z.string().min(1),
  WEATHERLINK_API_SECRET: z.string().min(1),
  WEATHERLINK_STATION_ID: z.string().optional(),
  WEATHERLINK_BASE_URL: z.string().url().default('https://api.weatherlink.com/v2'),
  DATABASE_PATH: z.string().min(1).default('./data/weather.db'),
  PORT: z.coerce.number().int().min(1).max(65535).default(1456),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  APP_TIMEZONE: z.string().default('Europe/Dublin'),
  CURRENT_POLL_INTERVAL_MS: z.coerce.number().int().min(10000).default(60000),
  CURRENT_DELAYED_AFTER_SECONDS: z.coerce.number().int().min(1).default(300),
  CURRENT_STALE_AFTER_SECONDS: z.coerce.number().int().min(1).default(900),
  METRICS_ENABLED: z.coerce.boolean().default(true),
  HISTORIC_SYNC_INTERVAL_MS: z.coerce.number().int().min(60000).default(900000),
  HISTORIC_BACKFILL_DAYS: z.coerce.number().int().min(0).default(0),
  // 0 keeps data forever. The full history is the training set for forecasting.
  RETENTION_OBSERVATION_MAX_AGE_DAYS: z.coerce.number().int().min(0).default(0),
  RETENTION_SUMMARY_MAX_AGE_DAYS: z.coerce.number().int().min(0).default(0),
  CLEANUP_INTERVAL_MS: z.coerce.number().int().min(3600000).default(86400000),
  ALERT_RULES_JSON: z.string().default('[]'),
  // Shared secret for POST /api/v1/ingest/:kind. Unset disables uploads.
  INGEST_TOKEN: optional(z.string().min(16, 'INGEST_TOKEN must be at least 16 characters')),
  // Name this machine shows as on the Outputs page (defaults to the hostname).
  INGEST_SOURCE: optional(z.string().max(64)),
  // Built web app to serve alongside the API (the container sets this).
  WEB_DIST_DIR: optional(z.string()),
  // How much of the station's position the public snapshot shows on the Map page:
  // exact, approximate (a 0.1° grid cell, about a town) or hidden.
  PUBLIC_LOCATION: optional(z.enum(['exact', 'approximate', 'hidden'])).transform((v) => v ?? 'approximate'),
});

export type Env = z.infer<typeof EnvSchema>;
