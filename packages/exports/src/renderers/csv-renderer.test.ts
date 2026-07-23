import { describe, it, expect } from 'vitest';
import { renderCsv } from './csv-renderer.js';
import { anObservation, aMeasurement } from '@weather/test-support';
import type { MeasurementName } from '@weather/domain';

describe('renderCsv', () => {
  it('renders observations as CSV', () => {
    const obs = anObservation({
      timestamp: new Date('2026-07-17T14:00:00Z'),
      measurements: new Map([
        ['temperature.outdoor', aMeasurement({ value: 18.5 })],
        ['humidity.outdoor', aMeasurement({ name: 'humidity.outdoor' as MeasurementName, value: 65 })],
      ]),
    });

    const csv = renderCsv([obs], ['temperature.outdoor' as MeasurementName, 'humidity.outdoor' as MeasurementName]);
    const lines = csv.split('\n');

    expect(lines[0]).toBe('timestamp,temperature.outdoor,humidity.outdoor');
    expect(lines[1]).toContain('2026-07-17T14:00:00');
    expect(lines[1]).toContain('18.5');
    expect(lines[1]).toContain('65');
  });

  it('renders empty values for missing metrics', () => {
    const obs = anObservation({
      measurements: new Map([
        ['temperature.outdoor', aMeasurement({ value: 18.5 })],
      ]),
    });

    const csv = renderCsv([obs], ['temperature.outdoor' as MeasurementName, 'humidity.outdoor' as MeasurementName]);
    const lines = csv.split('\n');

    expect(lines[1]).toMatch(/18\.5,$/);
  });
});
