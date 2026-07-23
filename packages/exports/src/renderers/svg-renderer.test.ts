import { describe, it, expect } from 'vitest';
import { renderSvg } from './svg-renderer.js';
import type { SeriesResult } from '@weather/analytics';
import type { MeasurementName, CanonicalUnit } from '@weather/domain';

describe('renderSvg', () => {
  it('renders an SVG chart', () => {
    const series: SeriesResult = {
      metric: 'temperature.outdoor' as MeasurementName,
      unit: 'celsius' as CanonicalUnit,
      resolution: 'hourly',
      points: [
        { timestamp: 1721217600000, value: 18 },
        { timestamp: 1721221200000, value: 22 },
        { timestamp: 1721224800000, value: 20 },
      ],
    };

    const svg = renderSvg([series]);

    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('<path');
    expect(svg).toContain('temperature.outdoor');
  });

  it('handles empty series', () => {
    const svg = renderSvg([]);
    expect(svg).toContain('No data');
  });
});
