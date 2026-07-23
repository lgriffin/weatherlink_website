import { z } from 'zod';
import { WeatherLinkSensorDataSchema } from './current.js';

export const WeatherLinkHistoricResponseSchema = z.object({
  station_id: z.number(),
  sensors: z.array(WeatherLinkSensorDataSchema),
  generated_at: z.number(),
});

export type WeatherLinkHistoricResponse = z.infer<typeof WeatherLinkHistoricResponseSchema>;
