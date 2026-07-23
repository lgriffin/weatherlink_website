import { z } from 'zod';

export const WeatherLinkSensorSchema = z.object({
  lsid: z.number(),
  sensor_type: z.number(),
  category: z.string().nullable().optional(),
  manufacturer: z.string().nullable().optional(),
  product_name: z.string().nullable().optional(),
  product_number: z.string().nullable().optional(),
  rain_collector_type: z.number().nullable().optional(),
  active: z.boolean().nullable().optional(),
  created_date: z.number().nullable().optional(),
  modified_date: z.number().nullable().optional(),
  station_id: z.number().nullable().optional(),
  station_name: z.string().nullable().optional(),
  parent_device_type: z.string().nullable().optional(),
  parent_device_name: z.string().nullable().optional(),
  parent_device_id: z.number().nullable().optional(),
  parent_device_id_hex: z.string().nullable().optional(),
  port_number: z.number().nullable().optional(),
  data_structure_type: z.number().nullable().optional(),
});

export type WeatherLinkSensor = z.infer<typeof WeatherLinkSensorSchema>;

export const WeatherLinkSensorsResponseSchema = z.object({
  sensors: z.array(WeatherLinkSensorSchema),
  generated_at: z.number().nullable().optional(),
});

export type WeatherLinkSensorsResponse = z.infer<typeof WeatherLinkSensorsResponseSchema>;
