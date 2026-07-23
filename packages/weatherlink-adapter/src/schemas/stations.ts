import { z } from 'zod';

export const WeatherLinkStationSchema = z.object({
  station_id: z.number(),
  station_name: z.string(),
  gateway_id: z.number().nullable().optional(),
  gateway_id_hex: z.string().nullable().optional(),
  product_number: z.string().nullable().optional(),
  username: z.string().nullable().optional(),
  user_email: z.string().nullable().optional(),
  company_name: z.string().nullable().optional(),
  active: z.boolean().nullable().optional(),
  private: z.boolean().nullable().optional(),
  recording_interval: z.number().nullable().optional(),
  firmware_version: z.string().nullable().optional(),
  registered_date: z.number().nullable().optional(),
  time_zone: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  elevation: z.number().nullable().optional(),
});

export type WeatherLinkStation = z.infer<typeof WeatherLinkStationSchema>;

export const WeatherLinkStationsResponseSchema = z.object({
  stations: z.array(WeatherLinkStationSchema),
  generated_at: z.number().nullable().optional(),
});

export type WeatherLinkStationsResponse = z.infer<typeof WeatherLinkStationsResponseSchema>;
