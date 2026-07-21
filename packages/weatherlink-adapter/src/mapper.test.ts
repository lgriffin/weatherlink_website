import { describe, it, expect } from 'vitest';
import { mapIssDataToMeasurements, mapBarometerDataToMeasurements, mergeMeasurementMaps } from './mapper.js';
import type { IssConditions, BarometerConditions } from './schemas/current.js';

function makeIssData(overrides?: Partial<IssConditions>): IssConditions {
  return {
    lsid: 12345,
    data_structure_type: 23,
    ts: 1721221200,
    temp: 72.5,
    hum: 65,
    dew_point: 59.2,
    wet_bulb: null,
    heat_index: 74.1,
    wind_chill: null,
    thw_index: null,
    thsw_index: null,
    wind_speed_last: 5.0,
    wind_dir_last: 180,
    wind_speed_avg_last_1_min: 4.5,
    wind_dir_scalar_avg_last_1_min: 175,
    wind_speed_avg_last_2_min: 4.2,
    wind_dir_scalar_avg_last_2_min: 178,
    wind_speed_avg_last_10_min: 4.0,
    wind_dir_scalar_avg_last_10_min: 176,
    wind_speed_hi_last_2_min: 8.0,
    wind_dir_at_hi_speed_last_2_min: 190,
    wind_speed_hi_last_10_min: 10.0,
    wind_dir_at_hi_speed_last_10_min: 185,
    rain_size: 1,
    rain_rate_last: 0,
    rain_rate_hi: 0,
    rainfall_last_15_min: 0,
    rain_rate_hi_last_15_min: 0,
    rainfall_last_60_min: 0,
    rainfall_last_24_hr: 0.02,
    rain_storm: 0.15,
    rain_storm_start_at: null,
    rainfall_daily: 0.05,
    rainfall_monthly: 1.2,
    rainfall_year: 15.5,
    solar_rad: 450,
    uv_index: 3.5,
    trans_battery_flag: 0,
    rx_state: 0,
    ...overrides,
  };
}

function makeBaroData(overrides?: Partial<BarometerConditions>): BarometerConditions {
  return {
    lsid: 67890,
    data_structure_type: 12,
    ts: 1721221200,
    bar_sea_level: 29.92,
    bar_trend: -0.02,
    bar_absolute: 29.85,
    ...overrides,
  };
}

const timestamp = new Date('2026-07-17T14:00:00Z');

describe('mapIssDataToMeasurements', () => {
  it('maps temperature from Fahrenheit to Celsius', () => {
    const result = mapIssDataToMeasurements(makeIssData({ temp: 72.5 }), timestamp);
    const temp = result.get('temperature.outdoor');
    expect(temp).toBeDefined();
    expect(temp!.value).toBeCloseTo(22.5, 1);
    expect(temp!.unit).toBe('celsius');
  });

  it('maps humidity as-is (no conversion)', () => {
    const result = mapIssDataToMeasurements(makeIssData({ hum: 65 }), timestamp);
    const hum = result.get('humidity.outdoor');
    expect(hum).toBeDefined();
    expect(hum!.value).toBe(65);
    expect(hum!.unit).toBe('percent');
  });

  it('maps wind speed from mph to m/s', () => {
    const result = mapIssDataToMeasurements(makeIssData({ wind_speed_last: 10 }), timestamp);
    const wind = result.get('wind.speed');
    expect(wind).toBeDefined();
    expect(wind!.value).toBeCloseTo(4.4704, 3);
    expect(wind!.unit).toBe('m/s');
  });

  it('maps wind direction as-is', () => {
    const result = mapIssDataToMeasurements(makeIssData({ wind_dir_last: 270 }), timestamp);
    const dir = result.get('wind.direction');
    expect(dir).toBeDefined();
    expect(dir!.value).toBe(270);
    expect(dir!.unit).toBe('degrees');
  });

  it('maps rainfall from inches to mm', () => {
    const result = mapIssDataToMeasurements(makeIssData({ rainfall_daily: 0.5 }), timestamp);
    const rain = result.get('rain.daily');
    expect(rain).toBeDefined();
    expect(rain!.value).toBeCloseTo(12.7, 1);
    expect(rain!.unit).toBe('mm');
  });

  it('maps solar radiation as-is', () => {
    const result = mapIssDataToMeasurements(makeIssData({ solar_rad: 800 }), timestamp);
    const solar = result.get('solar.radiation');
    expect(solar).toBeDefined();
    expect(solar!.value).toBe(800);
    expect(solar!.unit).toBe('W/m2');
  });

  it('maps null values to null (never zero)', () => {
    const result = mapIssDataToMeasurements(makeIssData({ temp: null }), timestamp);
    const temp = result.get('temperature.outdoor');
    expect(temp).toBeDefined();
    expect(temp!.value).toBeNull();
  });

  it('maps undefined values to null', () => {
    const result = mapIssDataToMeasurements(makeIssData({ wet_bulb: undefined }), timestamp);
    const wb = result.get('temperature.wetBulb');
    expect(wb).toBeDefined();
    expect(wb!.value).toBeNull();
  });

  it('preserves the timestamp on all measurements', () => {
    const result = mapIssDataToMeasurements(makeIssData(), timestamp);
    for (const [, m] of result) {
      expect(m.timestamp).toBe(timestamp);
    }
  });
});

describe('mapBarometerDataToMeasurements', () => {
  it('maps sea-level pressure from inHg to hPa', () => {
    const result = mapBarometerDataToMeasurements(makeBaroData({ bar_sea_level: 29.92 }), timestamp);
    const pressure = result.get('pressure.seaLevel');
    expect(pressure).toBeDefined();
    expect(pressure!.value).toBeCloseTo(1013.25, 0);
    expect(pressure!.unit).toBe('hPa');
  });

  it('maps absolute pressure', () => {
    const result = mapBarometerDataToMeasurements(makeBaroData({ bar_absolute: 29.85 }), timestamp);
    const pressure = result.get('pressure.absolute');
    expect(pressure).toBeDefined();
    expect(pressure!.value).toBeCloseTo(1010.9, 0);
  });

  it('maps null pressure to null', () => {
    const result = mapBarometerDataToMeasurements(makeBaroData({ bar_sea_level: null }), timestamp);
    const pressure = result.get('pressure.seaLevel');
    expect(pressure).toBeDefined();
    expect(pressure!.value).toBeNull();
  });
});

describe('mergeMeasurementMaps', () => {
  it('merges ISS and barometer measurements', () => {
    const iss = mapIssDataToMeasurements(makeIssData(), timestamp);
    const baro = mapBarometerDataToMeasurements(makeBaroData(), timestamp);
    const merged = mergeMeasurementMaps(iss, baro);

    expect(merged.has('temperature.outdoor')).toBe(true);
    expect(merged.has('pressure.seaLevel')).toBe(true);
    expect(merged.size).toBeGreaterThan(iss.size);
  });

  it('later maps override earlier ones for same key', () => {
    const map1 = new Map([['key', { name: 'temperature.outdoor' as const, value: 1, unit: 'celsius' as const, timestamp }]]);
    const map2 = new Map([['key', { name: 'temperature.outdoor' as const, value: 2, unit: 'celsius' as const, timestamp }]]);
    const merged = mergeMeasurementMaps(map1, map2);
    expect(merged.get('key')!.value).toBe(2);
  });
});
