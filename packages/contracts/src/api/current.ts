import { z } from 'zod';

export const MeasurementResponseSchema = z.object({
  name: z.string(),
  value: z.number().nullable(),
  unit: z.string(),
  timestamp: z.string().datetime(),
});

export type MeasurementResponse = z.infer<typeof MeasurementResponseSchema>;

export const CurrentConditionsResponseSchema = z.object({
  stationId: z.string(),
  stationName: z.string(),
  timestamp: z.string().datetime().nullable(),
  freshness: z.object({
    state: z.enum(['live', 'delayed', 'stale', 'unavailable']),
    ageSeconds: z.number().nullable(),
  }),
  measurements: z.record(z.string(), MeasurementResponseSchema),
});

export type CurrentConditionsResponse = z.infer<typeof CurrentConditionsResponseSchema>;
