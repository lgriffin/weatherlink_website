import { describe, it, expect } from 'vitest';
import { stationId, sensorId } from '@weather/domain';
import type { ArchiveRecord } from '@weather/domain';
import { mapHistoricIssDataToMeasurements } from './mapper.js';
import { WeatherLinkDataSource } from './weatherlink-data-source.js';
import type { WeatherLinkClient } from './client.js';

const ts = 1759100400; // 2025-09-28T23:00:00Z
const at = new Date(ts * 1000);

function issArchivePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ts,
    arch_int: 900,
    temp_avg: 50,
    temp_hi: 52,
    temp_lo: 48.2,
    hum_last: 90,
    hum_hi: 94,
    hum_lo: 88,
    dew_point_last: 47,
    dew_point_hi: 48,
    dew_point_lo: 46,
    wind_speed_avg: 5,
    wind_speed_hi: 20,
    wind_dir_of_prevail: 225,
    wind_dir_of_hi: 240,
    wind_run: 1.25,
    rainfall_mm: 1.2,
    rainfall_in: 0.047,
    rain_rate_hi_mm: 6.4,
    solar_rad_avg: 0,
    solar_rad_hi: 0,
    uv_index_avg: 0,
    uv_index_hi: 0,
    et: 0.001,
    deg_days_heat: 0.15,
    deg_days_cool: 0,
    iss_reception: 97,
    ...overrides,
  };
}

const noopLogger = { warn: () => {}, info: () => {}, debug: () => {}, error: () => {} } as never;

describe('mapHistoricIssDataToMeasurements', () => {
  it('keeps the interval high and low temperatures', () => {
    const m = mapHistoricIssDataToMeasurements(issArchivePayload() as never, at);
    expect(m.get('temperature.outdoor')?.value).toBeCloseTo(10, 5);
    expect(m.get('temperature.outdoorHigh')?.value).toBeCloseTo(11.111, 3);
    expect(m.get('temperature.outdoorLow')?.value).toBeCloseTo(9, 5);
  });

  it('maps interval rainfall as rain.interval, not a daily total', () => {
    const m = mapHistoricIssDataToMeasurements(issArchivePayload() as never, at);
    expect(m.get('rain.interval')?.value).toBe(1.2);
    expect(m.has('rain.daily')).toBe(false);
  });

  it('falls back to inches when no mm value is sent', () => {
    const m = mapHistoricIssDataToMeasurements(issArchivePayload({ rainfall_mm: null, rainfall_in: 0.1 }) as never, at);
    expect(m.get('rain.interval')?.value).toBeCloseTo(2.54, 5);
  });

  it('maps the extra archive fields in canonical units', () => {
    const m = mapHistoricIssDataToMeasurements(issArchivePayload() as never, at);
    expect(m.get('wind.run')?.value).toBeCloseTo(2.01168, 5);
    expect(m.get('wind.gustDirection')?.value).toBe(240);
    expect(m.get('evapotranspiration')?.value).toBeCloseTo(0.0254, 5);
    expect(m.get('degreeDays.heating')?.value).toBeCloseTo(0.08333, 4);
    expect(m.get('station.issReception')?.value).toBe(97);
    expect(m.get('humidity.outdoorLow')?.value).toBe(88);
  });

  it('keeps missing interval extremes as null', () => {
    const m = mapHistoricIssDataToMeasurements(issArchivePayload({ temp_hi: null }) as never, at);
    expect(m.get('temperature.outdoorHigh')?.value).toBeNull();
  });
});

describe('WeatherLinkDataSource archive', () => {
  const client = {
    getHistoric: async () => ({
      station_id: 42,
      generated_at: ts,
      sensors: [
        { lsid: 7, sensor_type: 45, data_structure_type: 11, data: [issArchivePayload()] },
        { lsid: 8, sensor_type: 242, data_structure_type: 13, data: [{ ts, arch_int: 900, bar_sea_level: 30, bar_absolute: 29.5 }] },
        { lsid: 9, sensor_type: 504, data_structure_type: 15, data: [{ ts }] },
      ],
    }),
  } as unknown as WeatherLinkClient;
  const source = new WeatherLinkDataSource(client, noopLogger);

  it('returns raw records for ISS and barometer sensors with the interval length', async () => {
    const records = await source.getHistoricArchive(stationId('42'), ts - 900, ts);
    expect(records).toHaveLength(2);
    expect(records[0]!.intervalMinutes).toBe(15);
    expect(records[0]!.timestamp).toEqual(at);
    expect((records[0]!.payload as Record<string, unknown>)['temp_hi']).toBe(52);
  });

  it('maps archive records to historic observations with stable ids', async () => {
    const records = await source.getHistoricArchive(stationId('42'), ts - 900, ts);
    const first = source.mapArchiveRecords(records);
    const second = source.mapArchiveRecords(records);
    expect(first).toHaveLength(2);
    expect(first.every((o) => o.source === 'historic')).toBe(true);
    expect(first.map((o) => o.id)).toEqual(second.map((o) => o.id));
    const baro = first.find((o) => o.sensorId === sensorId('8'));
    expect(baro?.measurements.get('pressure.seaLevel')?.value).toBeCloseTo(1015.917, 2);
  });

  it('skips records from sensor types it cannot map', () => {
    const record: ArchiveRecord = {
      stationId: stationId('42'),
      sensorId: sensorId('9'),
      sensorType: 504,
      timestamp: at,
      intervalMinutes: 15,
      payload: { ts },
      fetchedAt: at,
    };
    expect(source.mapArchiveRecords([record])).toEqual([]);
  });
});
