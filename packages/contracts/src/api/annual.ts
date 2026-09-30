import { z } from 'zod';

const MonthCounts = z.array(z.number().nullable()).length(12);

export const ThresholdRowSchema = z.object({
  threshold: z.number(),
  byYear: z.record(z.object({ months: MonthCounts, total: z.number() })),
});

export const AnnualStatsResponseSchema = z.object({
  asOf: z.string(),
  years: z.array(z.string()),
  coverage: z.array(z.object({
    year: z.string(),
    completeDays: z.array(z.number()).length(12),
    elapsedDays: z.array(z.number()).length(12),
  })),
  groups: z.array(z.object({
    key: z.enum(['warm', 'cold', 'wet']),
    rows: z.array(ThresholdRowSchema),
  })),
});

export type AnnualStatsResponse = z.infer<typeof AnnualStatsResponseSchema>;
export type ThresholdRowResponse = z.infer<typeof ThresholdRowSchema>;
