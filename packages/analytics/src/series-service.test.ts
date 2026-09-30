import { describe, it, expect } from 'vitest';
import { buildSeriesFromObservations, buildSeriesFromSummaries } from './series-service.js';
import { anObservation, aMeasurement, aDailySummary } from '@weather/test-support';
import type { MeasurementName } from '@weather/domain';

describe('buildSeriesFromObservations', () => {
  it('builds raw series from observations', () => {
    const obs1 = anObservation({
      timestamp: new Date('2026-07-17T10:00:00Z'),
      measurements: new Map([
        ['temperature.outdoor', aMeasurement({ value: 18, timestamp: new Date('2026-07-17T10:00:00Z') })],
      ]),
    });
    const obs2 = anObservation({
      timestamp: new Date('2026-07-17T11:00:00Z'),
      measurements: new Map([
        ['temperature.outdoor', aMeasurement({ value: 22, timestamp: new Date('2026-07-17T11:00:00Z') })],
      ]),
    });

    const result = buildSeriesFromObservations('temperature.outdoor' as MeasurementName, [obs1, obs2], 'raw');

    expect(result.metric).toBe('temperature.outdoor');
    expect(result.resolution).toBe('raw');
    expect(result.points).toHaveLength(2);
    expect(result.points[0]!.value).toBe(18);
    expect(result.points[1]!.value).toBe(22);
  });

  it('averages values into hourly buckets', () => {
    const obs1 = anObservation({
      timestamp: new Date('2026-07-17T10:15:00Z'),
      measurements: new Map([
        ['temperature.outdoor', aMeasurement({ value: 18 })],
      ]),
    });
    const obs2 = anObservation({
      timestamp: new Date('2026-07-17T10:45:00Z'),
      measurements: new Map([
        ['temperature.outdoor', aMeasurement({ value: 22 })],
      ]),
    });

    const result = buildSeriesFromObservations('temperature.outdoor' as MeasurementName, [obs1, obs2], 'hourly');

    expect(result.points).toHaveLength(1);
    expect(result.points[0]!.value).toBe(20);
  });

  it('returns empty points for missing metric', () => {
    const obs = anObservation({
      measurements: new Map([
        ['humidity.outdoor', aMeasurement({ name: 'humidity.outdoor' as MeasurementName, value: 60 })],
      ]),
    });

    const result = buildSeriesFromObservations('temperature.outdoor' as MeasurementName, [obs], 'raw');
    expect(result.points).toHaveLength(0);
  });
});

describe('buildSeriesFromSummaries', () => {
  it('builds daily series from summaries', () => {
    const summaries = [
      aDailySummary({ date: '2026-07-15', avg: 18 }),
      aDailySummary({ date: '2026-07-16', avg: 20 }),
      aDailySummary({ date: '2026-07-17', avg: 22 }),
    ];

    const result = buildSeriesFromSummaries('temperature.outdoor' as MeasurementName, summaries, 'avg');

    expect(result.resolution).toBe('daily');
    expect(result.points).toHaveLength(3);
    expect(result.points[0]!.value).toBe(18);
    expect(result.points[2]!.value).toBe(22);
  });

  it('uses the daily total for summed measurements such as rain', () => {
    const summaries = [
      aDailySummary({ date: '2026-07-15', measurementName: 'rain.daily' as MeasurementName, min: null, max: 4.2, avg: null }),
    ];

    const result = buildSeriesFromSummaries('rain.daily' as MeasurementName, summaries, 'avg');

    expect(result.points[0]!.value).toBe(4.2);
  });
});
