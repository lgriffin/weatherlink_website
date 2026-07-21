import { z } from 'zod';

export const ComponentHealthResponseSchema = z.object({
  name: z.string(),
  status: z.enum(['up', 'down', 'unknown']),
  latencyMs: z.number().nullable(),
  message: z.string().nullable(),
});

export const HealthResponseSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  uptime: z.number(),
  components: z.array(ComponentHealthResponseSchema),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
