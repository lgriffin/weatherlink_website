import { z } from 'zod';

export const StationResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  timezone: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  elevationMetres: z.number().nullable(),
  isActive: z.boolean(),
});

export type StationResponse = z.infer<typeof StationResponseSchema>;

export const StationListResponseSchema = z.object({
  stations: z.array(StationResponseSchema),
});

export type StationListResponse = z.infer<typeof StationListResponseSchema>;
