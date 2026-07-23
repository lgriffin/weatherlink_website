import { z } from 'zod';

export const SeriesPointSchema = z.object({
  timestamp: z.number(),
  value: z.number().nullable(),
});

export const SeriesResultSchema = z.object({
  metric: z.string(),
  unit: z.string(),
  resolution: z.enum(['raw', 'hourly', 'daily']),
  points: z.array(SeriesPointSchema),
});

export const TimeSeriesResponseSchema = z.object({
  series: z.array(SeriesResultSchema),
});

export type TimeSeriesResponse = z.infer<typeof TimeSeriesResponseSchema>;
