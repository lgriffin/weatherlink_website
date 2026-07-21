import type { CanonicalUnit } from './units.js';

export type MeasurementName =
  | 'temperature.outdoor'
  | 'temperature.indoor'
  | 'temperature.apparent'
  | 'temperature.dewPoint'
  | 'temperature.heatIndex'
  | 'temperature.windChill'
  | 'temperature.wetBulb'
  | 'temperature.thwIndex'
  | 'temperature.thswIndex'
  | 'humidity.outdoor'
  | 'humidity.indoor'
  | 'pressure.seaLevel'
  | 'pressure.absolute'
  | 'pressure.trend'
  | 'wind.speed'
  | 'wind.gust'
  | 'wind.direction'
  | 'wind.speedAvg1Min'
  | 'wind.speedAvg2Min'
  | 'wind.speedAvg10Min'
  | 'rain.rate'
  | 'rain.last15Min'
  | 'rain.last60Min'
  | 'rain.last24Hr'
  | 'rain.daily'
  | 'rain.monthly'
  | 'rain.yearly'
  | 'rain.stormTotal'
  | 'solar.radiation'
  | 'uv.index'
  | 'air.pm1'
  | 'air.pm2_5'
  | 'air.pm10'
  | 'soil.temperature'
  | 'soil.moisture'
  | 'leaf.wetness'
  | 'evapotranspiration';

export interface Measurement {
  readonly name: MeasurementName;
  readonly value: number | null;
  readonly unit: CanonicalUnit;
  readonly timestamp: Date;
}
