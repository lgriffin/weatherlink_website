import { z } from 'zod';

export const RunningTotalMetricSchema = z.enum([
  'rain.daily',
  'degreeDays.heating',
  'degreeDays.cooling',
  'evapotranspiration',
  'wind.run',
]);

export const YearRunningTotalSchema = z.object({
  year: z.string(),
  startDate: z.string(),
  points: z.array(z.object({ monthDay: z.string(), total: z.number() })),
  final: z.number(),
  incompleteDays: z.number(),
});

export const MonthScoreSchema = z.object({
  year: z.string(),
  meanTemp: z.number().nullable(),
  maxTemp: z.number().nullable(),
  minTemp: z.number().nullable(),
  rainTotal: z.number().nullable(),
  wetDays: z.number(),
  frostDays: z.number(),
  peakGust: z.number().nullable(),
  completeDays: z.number(),
  daysInMonth: z.number(),
});

export const WeatherRunSchema = z.object({
  kind: z.enum(['dry', 'wet', 'frost', 'warm']),
  current: z.number(),
  currentStart: z.string().nullable(),
  longest: z.number(),
  longestEnd: z.string().nullable(),
});

export const YearComparisonResponseSchema = z.object({
  asOf: z.string(),
  metric: RunningTotalMetricSchema,
  month: z.number().int().min(1).max(12),
  runningTotals: z.array(YearRunningTotalSchema),
  monthScores: z.array(MonthScoreSchema),
  runs: z.array(WeatherRunSchema),
});

export type RunningTotalMetricDto = z.infer<typeof RunningTotalMetricSchema>;
export type YearComparisonResponse = z.infer<typeof YearComparisonResponseSchema>;
export type MonthScoreResponse = z.infer<typeof MonthScoreSchema>;
export type WeatherRunResponse = z.infer<typeof WeatherRunSchema>;
