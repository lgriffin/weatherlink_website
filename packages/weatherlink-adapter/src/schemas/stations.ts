import { z } from 'zod';

export const WeatherLinkStationSchema = z.object({
  station_id: z.number(),
  station_name: z.string(),
  gateway_id: z.number().optional(),
  gateway_id_hex: z.string().optional(),
  product_number: z.string().optional(),
  username: z.string().optional(),
  user_email: z.string().optional(),
  company_name: z.string().optional(),
  active: z.boolean().optional(),
  private: z.boolean().optional(),
  recording_interval: z.number().optional(),
  firmware_version: z.string().optional(),
  registered_date: z.number().optional(),
  time_zone: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  country: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  elevation: z.number().optional(),
});

export type WeatherLinkStation = z.infer<typeof WeatherLinkStationSchema>;

export const WeatherLinkStationsResponseSchema = z.object({
  stations: z.array(WeatherLinkStationSchema),
  generated_at: z.number().optional(),
});

export type WeatherLinkStationsResponse = z.infer<typeof WeatherLinkStationsResponseSchema>;
