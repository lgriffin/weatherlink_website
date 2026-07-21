import { z } from 'zod';

const numOrNull = z.number().nullable().optional();

export const IssConditionsSchema = z.object({
  lsid: z.number(),
  data_structure_type: z.number(),
  ts: z.number(),
  temp: numOrNull,
  hum: numOrNull,
  dew_point: numOrNull,
  wet_bulb: numOrNull,
  heat_index: numOrNull,
  wind_chill: numOrNull,
  thw_index: numOrNull,
  thsw_index: numOrNull,
  wind_speed_last: numOrNull,
  wind_dir_last: numOrNull,
  wind_speed_avg_last_1_min: numOrNull,
  wind_dir_scalar_avg_last_1_min: numOrNull,
  wind_speed_avg_last_2_min: numOrNull,
  wind_dir_scalar_avg_last_2_min: numOrNull,
  wind_speed_avg_last_10_min: numOrNull,
  wind_dir_scalar_avg_last_10_min: numOrNull,
  wind_speed_hi_last_2_min: numOrNull,
  wind_dir_at_hi_speed_last_2_min: numOrNull,
  wind_speed_hi_last_10_min: numOrNull,
  wind_dir_at_hi_speed_last_10_min: numOrNull,
  rain_size: numOrNull,
  rain_rate_last: numOrNull,
  rain_rate_hi: numOrNull,
  rainfall_last_15_min: numOrNull,
  rain_rate_hi_last_15_min: numOrNull,
  rainfall_last_60_min: numOrNull,
  rainfall_last_24_hr: numOrNull,
  rain_storm: numOrNull,
  rain_storm_start_at: numOrNull,
  rainfall_daily: numOrNull,
  rainfall_monthly: numOrNull,
  rainfall_year: numOrNull,
  solar_rad: numOrNull,
  uv_index: numOrNull,
  trans_battery_flag: numOrNull,
  rx_state: numOrNull,
}).passthrough();

export type IssConditions = z.infer<typeof IssConditionsSchema>;

export const BarometerConditionsSchema = z.object({
  lsid: z.number(),
  data_structure_type: z.number(),
  ts: z.number(),
  bar_sea_level: numOrNull,
  bar_trend: numOrNull,
  bar_absolute: numOrNull,
}).passthrough();

export type BarometerConditions = z.infer<typeof BarometerConditionsSchema>;

export const WeatherLinkSensorDataSchema = z.object({
  lsid: z.number(),
  sensor_type: z.number(),
  data_structure_type: z.number().optional(),
  data: z.array(z.record(z.unknown())),
});

export type WeatherLinkSensorData = z.infer<typeof WeatherLinkSensorDataSchema>;

export const WeatherLinkCurrentResponseSchema = z.object({
  station_id: z.number(),
  sensors: z.array(WeatherLinkSensorDataSchema),
  generated_at: z.number(),
});

export type WeatherLinkCurrentResponse = z.infer<typeof WeatherLinkCurrentResponseSchema>;
