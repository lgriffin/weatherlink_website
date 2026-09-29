import { describe, it, expect } from 'vitest';
import { computeDailySummaries } from './aggregation-service.js';
import { anObservation, aMeasurement } from '@weather/test-support';
import { stationId } from '@weather/domain';
import type { MeasurementName } from '@weather/domain';

describe('computeDailySummaries', () => {
  const sid = stationId('station-1');

  it('computes min/max/avg for each measurement', () => {
    const obs1 = anObservation({
      measurements: new Map([
        ['temperature.outdoor', aMeasurement({ value: 10 })],
        ['humidity.outdoor', aMeasurement({ name: 'humidity.outdoor' as MeasurementName, value: 60, unit: 'percent' })],
      ]),
    });
    const obs2 = anObservation({
      measurements: new Map([
        ['temperature.outdoor', aMeasurement({ value: 20 })],
        ['humidity.outdoor', aMeasurement({ name: 'humidity.outdoor' as MeasurementName, value: 80, unit: 'percent' })],
      ]),
    });

    const summaries = computeDailySummaries(sid, '2026-07-17', [obs1, obs2]);

    expect(summaries).toHaveLength(2);

    const temp = summaries.find((s) => s.measurementName === 'temperature.outdoor')!;
    expect(temp.min).toBe(10);
    expect(temp.max).toBe(20);
    expect(temp.avg).toBe(15);
    expect(temp.count).toBe(2);

    const hum = summaries.find((s) => s.measurementName === 'humidity.outdoor')!;
    expect(hum.min).toBe(60);
    expect(hum.max).toBe(80);
    expect(hum.avg).toBe(70);
  });

  it('skips null measurement values', () => {
    const obs = anObservation({
      measurements: new Map([
        ['temperature.outdoor', aMeasurement({ value: null })],
      ]),
    });

    const summaries = computeDailySummaries(sid, '2026-07-17', [obs]);
    expect(summaries).toHaveLength(0);
  });

  it('returns empty for no observations', () => {
    const summaries = computeDailySummaries(sid, '2026-07-17', []);
    expect(summaries).toHaveLength(0);
  });
});

describe('computeDailySummaries with archive intervals', () => {
  const sid = stationId('station-1');

  function interval(values: Record<string, number | null>) {
    const measurements = new Map(
      Object.entries(values).map(([name, value]) => [
        name,
        aMeasurement({ name: name as MeasurementName, value, unit: name.startsWith('rain') ? 'mm' : 'celsius' }),
      ]),
    );
    return anObservation({ source: 'historic', measurements });
  }

  it('sums interval rainfall into the daily total', () => {
    const summaries = computeDailySummaries(sid, '2026-07-17', [
      interval({ 'rain.interval': 0.2 }),
      interval({ 'rain.interval': 3.0 }),
      interval({ 'rain.interval': 1.4 }),
    ]);
    const rain = summaries.find((s) => s.measurementName === 'rain.daily')!;
    expect(rain.max).toBe(4.6);
    expect(rain.min).toBeNull();
    expect(rain.avg).toBeNull();
    expect(rain.count).toBe(3);
    expect(summaries.find((s) => s.measurementName === 'rain.interval')).toBeUndefined();
  });

  it('keeps a dry day as 0 mm, not missing', () => {
    const summaries = computeDailySummaries(sid, '2026-07-17', [interval({ 'rain.interval': 0 })]);
    expect(summaries.find((s) => s.measurementName === 'rain.daily')!.max).toBe(0);
  });

  it('uses interval highs and lows for the daily extremes', () => {
    const summaries = computeDailySummaries(sid, '2026-07-17', [
      interval({ 'temperature.outdoor': 10, 'temperature.outdoorHigh': 11.5, 'temperature.outdoorLow': 9.1 }),
      interval({ 'temperature.outdoor': 14, 'temperature.outdoorHigh': 16.2, 'temperature.outdoorLow': 13 }),
    ]);
    const temp = summaries.find((s) => s.measurementName === 'temperature.outdoor')!;
    expect(temp.max).toBe(16.2);
    expect(temp.min).toBe(9.1);
    expect(temp.avg).toBe(12);
    expect(summaries.some((s) => s.measurementName === 'temperature.outdoorHigh')).toBe(false);
  });
});
