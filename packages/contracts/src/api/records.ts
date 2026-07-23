import { z } from 'zod';

export const RecordResponseSchema = z.object({
  measurementName: z.string(),
  unit: z.string(),
  scope: z.enum(['all-time', 'monthly', 'yearly']),
  scopeKey: z.string(),
  recordType: z.enum(['high', 'low']),
  value: z.number(),
  date: z.string(),
});

export type RecordResponse = z.infer<typeof RecordResponseSchema>;

export const RecordsListResponseSchema = z.object({
  records: z.array(RecordResponseSchema),
});

export type RecordsListResponse = z.infer<typeof RecordsListResponseSchema>;
