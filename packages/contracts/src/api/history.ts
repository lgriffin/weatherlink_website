import { z } from 'zod';

export const DailySummaryResponseSchema = z.object({
  date: z.string(),
  min: z.number().nullable(),
  max: z.number().nullable(),
  avg: z.number().nullable(),
  count: z.number(),
});

export type DailySummaryResponse = z.infer<typeof DailySummaryResponseSchema>;

export const HistoryResponseSchema = z.object({
  monthDay: z.string(),
  measurements: z.record(z.string(), z.record(z.string(), DailySummaryResponseSchema)),
});

export type HistoryResponse = z.infer<typeof HistoryResponseSchema>;
