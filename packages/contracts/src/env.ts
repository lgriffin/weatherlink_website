import { z } from 'zod';

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
});

export type Env = z.infer<typeof EnvSchema>;
