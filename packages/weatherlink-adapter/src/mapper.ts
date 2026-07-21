import type { Measurement, MeasurementName } from '@weather/domain';
import type { IssConditions, BarometerConditions } from './schemas/current.js';
import { fahrenheitToCelsius, mphToMs, inHgToHpa, inchesToMm } from './conversions.js';
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

  addMeasurement(map, 'rain.rate', data.rain_rate_last, inchesToMm, timestamp);
  addMeasurement(map, 'rain.last15Min', data.rainfall_last_15_min, inchesToMm, timestamp);
  addMeasurement(map, 'rain.last60Min', data.rainfall_last_60_min, inchesToMm, timestamp);
  addMeasurement(map, 'rain.last24Hr', data.rainfall_last_24_hr, inchesToMm, timestamp);
  addMeasurement(map, 'rain.daily', data.rainfall_daily, inchesToMm, timestamp);
  addMeasurement(map, 'rain.monthly', data.rainfall_monthly, inchesToMm, timestamp);
  addMeasurement(map, 'rain.yearly', data.rainfall_year, inchesToMm, timestamp);
  addMeasurement(map, 'rain.stormTotal', data.rain_storm, inchesToMm, timestamp);

  addMeasurement(map, 'solar.radiation', data.solar_rad, null, timestamp);
  addMeasurement(map, 'uv.index', data.uv_index, null, timestamp);

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
