import type { Measurement, MeasurementName } from '@weather/domain';
import type { IssConditions, BarometerConditions } from './schemas/current.js';
import type { HistoricIssConditions } from './schemas/historic.js';
import {
  fahrenheitToCelsius,
  mphToMs,
  inHgToHpa,
  inchesToMm,
  milesToKm,
  fahrenheitDegreeDaysToCelsius,
} from './conversions.js';
import { MEASUREMENT_UNITS } from '@weather/domain';

function addMeasurement(
  map: Map<string, Measurement>,
  name: MeasurementName,
  rawValue: number | null | undefined,
  convert: ((v: number) => number) | null,
  timestamp: Date,
): void {
  const unit = MEASUREMENT_UNITS[name];
  if (!unit) return;

  const value = rawValue != null ? (convert ? convert(rawValue) : rawValue) : null;

  map.set(name, { name, value, unit, timestamp });
}

export function mapIssDataToMeasurements(
  data: IssConditions,
  timestamp: Date,
): Map<string, Measurement> {
  const map = new Map<string, Measurement>();

  addMeasurement(map, 'temperature.outdoor', data.temp, fahrenheitToCelsius, timestamp);
  addMeasurement(map, 'temperature.dewPoint', data.dew_point, fahrenheitToCelsius, timestamp);
  addMeasurement(map, 'temperature.wetBulb', data.wet_bulb, fahrenheitToCelsius, timestamp);
  addMeasurement(map, 'temperature.heatIndex', data.heat_index, fahrenheitToCelsius, timestamp);
  addMeasurement(map, 'temperature.windChill', data.wind_chill, fahrenheitToCelsius, timestamp);
  addMeasurement(map, 'temperature.thwIndex', data.thw_index, fahrenheitToCelsius, timestamp);
  addMeasurement(map, 'temperature.thswIndex', data.thsw_index, fahrenheitToCelsius, timestamp);

  addMeasurement(map, 'humidity.outdoor', data.hum, null, timestamp);

  addMeasurement(map, 'wind.speed', data.wind_speed_last, mphToMs, timestamp);
  addMeasurement(map, 'wind.gust', data.wind_speed_hi_last_10_min, mphToMs, timestamp);
  addMeasurement(map, 'wind.direction', data.wind_dir_last, null, timestamp);
  addMeasurement(map, 'wind.speedAvg1Min', data.wind_speed_avg_last_1_min, mphToMs, timestamp);
  addMeasurement(map, 'wind.speedAvg2Min', data.wind_speed_avg_last_2_min, mphToMs, timestamp);
  addMeasurement(map, 'wind.speedAvg10Min', data.wind_speed_avg_last_10_min, mphToMs, timestamp);

  addMeasurement(map, 'rain.rate', data.rain_rate_last ?? data.rain_rate_last_in, inchesToMm, timestamp);
  addMeasurement(map, 'rain.last15Min', data.rainfall_last_15_min ?? data.rainfall_last_15_min_in, inchesToMm, timestamp);
  addMeasurement(map, 'rain.last60Min', data.rainfall_last_60_min ?? data.rainfall_last_60_min_in, inchesToMm, timestamp);
  addMeasurement(map, 'rain.last24Hr', data.rainfall_last_24_hr ?? data.rainfall_last_24_hr_in, inchesToMm, timestamp);
  addMeasurement(map, 'rain.daily', data.rainfall_daily ?? data.rainfall_daily_in, inchesToMm, timestamp);
  addMeasurement(map, 'rain.monthly', data.rainfall_monthly ?? data.rainfall_monthly_in, inchesToMm, timestamp);
  addMeasurement(map, 'rain.yearly', data.rainfall_year ?? data.rainfall_year_in, inchesToMm, timestamp);
  addMeasurement(map, 'rain.stormTotal', data.rain_storm ?? data.rain_storm_in, inchesToMm, timestamp);

  addMeasurement(map, 'solar.radiation', data.solar_rad, null, timestamp);
  addMeasurement(map, 'uv.index', data.uv_index, null, timestamp);

  return map;
}

/**
 * Maps one archive interval. Each interval carries its own average, high and low;
 * rainfall is the amount that fell during the interval, not a running daily total.
 */
export function mapHistoricIssDataToMeasurements(
  data: HistoricIssConditions,
  timestamp: Date,
): Map<string, Measurement> {
  const map = new Map<string, Measurement>();

  addMeasurement(map, 'temperature.outdoor', data.temp_avg, fahrenheitToCelsius, timestamp);
  addMeasurement(map, 'temperature.outdoorHigh', data.temp_hi, fahrenheitToCelsius, timestamp);
  addMeasurement(map, 'temperature.outdoorLow', data.temp_lo, fahrenheitToCelsius, timestamp);
  addMeasurement(map, 'temperature.dewPoint', data.dew_point_last, fahrenheitToCelsius, timestamp);
  addMeasurement(map, 'temperature.dewPointHigh', data.dew_point_hi, fahrenheitToCelsius, timestamp);
  addMeasurement(map, 'temperature.dewPointLow', data.dew_point_lo, fahrenheitToCelsius, timestamp);
  addMeasurement(map, 'temperature.wetBulb', data.wet_bulb_last, fahrenheitToCelsius, timestamp);
  addMeasurement(map, 'temperature.heatIndex', data.heat_index_last, fahrenheitToCelsius, timestamp);
  addMeasurement(map, 'temperature.windChill', data.wind_chill_last, fahrenheitToCelsius, timestamp);
  addMeasurement(map, 'temperature.thwIndex', data.thw_index_last ?? data.thw_index_hi, fahrenheitToCelsius, timestamp);
  addMeasurement(map, 'temperature.thswIndex', data.thsw_index_last ?? data.thsw_index_hi, fahrenheitToCelsius, timestamp);

  addMeasurement(map, 'humidity.outdoor', data.hum_last, null, timestamp);
  addMeasurement(map, 'humidity.outdoorHigh', data.hum_hi, null, timestamp);
  addMeasurement(map, 'humidity.outdoorLow', data.hum_lo, null, timestamp);

  addMeasurement(map, 'wind.speed', data.wind_speed_avg, mphToMs, timestamp);
  addMeasurement(map, 'wind.gust', data.wind_speed_hi, mphToMs, timestamp);
  addMeasurement(map, 'wind.direction', data.wind_dir_of_prevail, null, timestamp);
  addMeasurement(map, 'wind.gustDirection', data.wind_dir_of_hi, null, timestamp);
  addMeasurement(map, 'wind.run', data.wind_run, milesToKm, timestamp);

  addMeasurement(map, 'rain.rate', data.rain_rate_hi_mm ?? data.rain_rate_hi_in, data.rain_rate_hi_mm != null ? null : inchesToMm, timestamp);
  addMeasurement(map, 'rain.interval', data.rainfall_mm ?? data.rainfall_in, data.rainfall_mm != null ? null : inchesToMm, timestamp);

  addMeasurement(map, 'solar.radiation', data.solar_rad_avg, null, timestamp);
  addMeasurement(map, 'solar.radiationHigh', data.solar_rad_hi, null, timestamp);
  addMeasurement(map, 'uv.index', data.uv_index_avg, null, timestamp);
  addMeasurement(map, 'uv.indexHigh', data.uv_index_hi, null, timestamp);

  addMeasurement(map, 'evapotranspiration', data.et, inchesToMm, timestamp);
  addMeasurement(map, 'degreeDays.heating', data.deg_days_heat, fahrenheitDegreeDaysToCelsius, timestamp);
  addMeasurement(map, 'degreeDays.cooling', data.deg_days_cool, fahrenheitDegreeDaysToCelsius, timestamp);
  addMeasurement(map, 'station.issReception', data.iss_reception, null, timestamp);

  return map;
}

export function mapBarometerDataToMeasurements(
  data: BarometerConditions,
  timestamp: Date,
): Map<string, Measurement> {
  const map = new Map<string, Measurement>();

  addMeasurement(map, 'pressure.seaLevel', data.bar_sea_level, inHgToHpa, timestamp);
  addMeasurement(map, 'pressure.absolute', data.bar_absolute, inHgToHpa, timestamp);
  addMeasurement(map, 'pressure.trend', data.bar_trend, inHgToHpa, timestamp);

  return map;
}

export function mergeMeasurementMaps(
  ...maps: Map<string, Measurement>[]
): Map<string, Measurement> {
  const merged = new Map<string, Measurement>();
  for (const map of maps) {
    for (const [key, value] of map) {
      merged.set(key, value);
    }
  }
  return merged;
}
