import { z } from 'zod';
import { ForecastPayloadSchema } from './ingest.js';

export const WeatherWarningSchema = z.object({
  level: z.enum(['yellow', 'orange', 'red', 'unknown']),
  type: z.string(),
  headline: z.string(),
  description: z.string(),
  onset: z.string().nullable(),
  expiry: z.string().nullable(),
  regions: z.array(z.string()),
});

/** GET /api/v1/forecast */
export const ForecastResponseSchema = z.object({
  forecast: z.object({
    source: z.string(),
    receivedAt: z.string(),
    /** True when tonight's forecast hasn't arrived and this one is from an earlier evening. */
    stale: z.boolean(),
    payload: ForecastPayloadSchema,
  }).nullable(),
  /** Met Éireann's warnings in force; null when they couldn't be fetched. */
  warnings: z.array(WeatherWarningSchema).nullable(),
});

export type WeatherWarningDto = z.infer<typeof WeatherWarningSchema>;
export type ForecastResponse = z.infer<typeof ForecastResponseSchema>;
