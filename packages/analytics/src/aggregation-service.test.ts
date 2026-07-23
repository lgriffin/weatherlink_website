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
