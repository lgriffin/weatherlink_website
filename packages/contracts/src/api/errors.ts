import { z } from 'zod';

export const ErrorCode = z.enum([
  'CONFIG_INVALID',
  'WEATHERLINK_AUTHENTICATION_FAILED',
  'WEATHERLINK_ACCESS_DENIED',
  'WEATHERLINK_RATE_LIMITED',
  'WEATHERLINK_UNAVAILABLE',
  'WEATHERLINK_PAYLOAD_INVALID',
  'HISTORIC_ACCESS_DENIED',
  'STATION_NOT_CONFIGURED',
  'METRIC_NOT_AVAILABLE',
  'INVALID_METRIC_AGGREGATION',
  'EXPORT_TOO_LARGE',
  'DATABASE_UNAVAILABLE',
  'AGGREGATE_INCOMPLETE',
]);

export type ErrorCode = z.infer<typeof ErrorCode>;

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    correlationId: z.string().optional(),
    details: z.record(z.unknown()).optional(),
  }),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
