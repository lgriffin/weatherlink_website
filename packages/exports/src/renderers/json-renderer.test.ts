import { describe, it, expect } from 'vitest';
import { renderJson } from './json-renderer.js';
import { anObservation, aMeasurement } from '@weather/test-support';
import type { MeasurementName } from '@weather/domain';

describe('renderJson', () => {
  it('renders observations as JSON', () => {
    const obs = anObservation({
      measurements: new Map([
        ['temperature.outdoor', aMeasurement({ value: 18.5 })],
      ]),
    });

    const json = renderJson([obs], ['temperature.outdoor' as MeasurementName]);
    const parsed = JSON.parse(json);

    expect(parsed.observations).toHaveLength(1);
    expect(parsed.observations[0].measurements['temperature.outdoor']).toBe(18.5);
    expect(parsed.exportedAt).toBeDefined();
  });

  it('fills null for missing metrics', () => {
    const obs = anObservation({
      measurements: new Map([
        ['temperature.outdoor', aMeasurement({ value: 18.5 })],
      ]),
    });

    const json = renderJson([obs], ['temperature.outdoor' as MeasurementName, 'humidity.outdoor' as MeasurementName]);
    const parsed = JSON.parse(json);

    expect(parsed.observations[0].measurements['humidity.outdoor']).toBeNull();
  });
});
