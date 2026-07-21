import { z } from 'zod';

export const WeatherLinkSensorSchema = z.object({
  lsid: z.number(),
  sensor_type: z.number(),
  category: z.string().optional(),
  manufacturer: z.string().optional(),
  product_name: z.string().optional(),
  product_number: z.string().optional(),
  rain_collector_type: z.number().optional(),
  active: z.boolean().optional(),
  created_date: z.number().optional(),
  modified_date: z.number().optional(),
  station_id: z.number().optional(),
  station_name: z.string().optional(),
  parent_device_type: z.string().optional(),
  parent_device_name: z.string().optional(),
  parent_device_id: z.number().optional(),
  parent_device_id_hex: z.string().optional(),
  port_number: z.number().optional(),
  data_structure_type: z.number().optional(),
});

export type WeatherLinkSensor = z.infer<typeof WeatherLinkSensorSchema>;

export const WeatherLinkSensorsResponseSchema = z.object({
  sensors: z.array(WeatherLinkSensorSchema),
  generated_at: z.number().optional(),
});

export type WeatherLinkSensorsResponse = z.infer<typeof WeatherLinkSensorsResponseSchema>;
