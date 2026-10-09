import { describe, expect, it } from 'vitest';
import { publicLocation } from './public-location.js';

describe('publicLocation', () => {
  it('keeps the exact spot when asked to', () => {
    expect(publicLocation(52.25843, -7.11214, 'exact')).toEqual({ latitude: 52.25843, longitude: -7.11214, radiusMetres: 0 });
  });

  it('snaps to a 0.1° grid and reports how far off it can be', () => {
    const loc = publicLocation(52.25843, -7.11214, 'approximate');
    expect(loc).toMatchObject({ latitude: 52.3, longitude: -7.1 });
    // Half a cell is 5.6 km north-south and 3.4 km east-west at 52°N.
    expect(loc!.radiusMetres).toBeGreaterThan(6_400);
    expect(loc!.radiusMetres).toBeLessThan(6_700);
  });

  it('never reveals more than the grid cell', () => {
    for (const [lat, lon] of [[53.34999, -6.26001], [51.9, -8.47], [-33.86, 151.21]] as const) {
      const loc = publicLocation(lat, lon, 'approximate')!;
      expect(Math.abs(loc.latitude - lat)).toBeLessThanOrEqual(0.05 + 1e-9);
      expect(Math.abs(loc.longitude - lon)).toBeLessThanOrEqual(0.05 + 1e-9);
      expect(Number.isInteger(Math.round(loc.latitude * 1e6) / 1e5)).toBe(true);
    }
  });

  it('shows nothing when hidden or unknown', () => {
    expect(publicLocation(52.2, -7.1, 'hidden')).toBeNull();
    expect(publicLocation(null, -7.1, 'exact')).toBeNull();
  });
});
