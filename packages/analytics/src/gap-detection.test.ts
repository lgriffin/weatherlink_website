import { describe, it, expect } from 'vitest';
import { GapScanner } from './gap-detection.js';
import { stationId } from '@weather/domain';

const sid = stationId('station-1');
const t = (iso: string) => new Date(iso);
const HOUR = 3600_000;

function every15Min(from: string, to: string, usable = true) {
  const points = [];
  for (let ms = Date.parse(from); ms <= Date.parse(to); ms += 15 * 60_000) {
    points.push({ timestamp: new Date(ms), usable });
  }
  return points;
}

describe('GapScanner', () => {
  it('finds nothing in continuous data', () => {
    const scanner = new GapScanner(sid, t('2026-01-01T00:00:00Z'), 2 * HOUR);
    scanner.add(every15Min('2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z'));
    expect(scanner.finish(t('2026-01-02T00:00:00Z'))).toEqual([]);
  });

  it('reports a span with no records as no-data', () => {
    const scanner = new GapScanner(sid, t('2026-01-01T00:00:00Z'), 2 * HOUR);
    scanner.add(every15Min('2026-01-01T00:00:00Z', '2026-01-01T06:00:00Z'));
    scanner.add(every15Min('2026-01-03T12:00:00Z', '2026-01-04T00:00:00Z'));
    const gaps = scanner.finish(t('2026-01-04T00:00:00Z'));
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({
      from: t('2026-01-01T06:00:00Z'),
      to: t('2026-01-03T12:00:00Z'),
      kind: 'no-data',
      recordsWithoutData: 0,
    });
  });

  it('reports records without outdoor data as a sensor fault', () => {
    const scanner = new GapScanner(sid, t('2026-01-01T00:00:00Z'), 2 * HOUR);
    scanner.add(every15Min('2026-01-01T00:00:00Z', '2026-01-01T06:00:00Z'));
    scanner.add(every15Min('2026-01-01T06:15:00Z', '2026-01-01T12:00:00Z', false));
    scanner.add(every15Min('2026-01-01T12:15:00Z', '2026-01-02T00:00:00Z'));
    const gaps = scanner.finish(t('2026-01-02T00:00:00Z'));
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.kind).toBe('sensor-fault');
    expect(gaps[0]!.recordsWithoutData).toBe(24);
  });

  it('ignores short dropouts under the threshold', () => {
    const scanner = new GapScanner(sid, t('2026-01-01T00:00:00Z'), 2 * HOUR);
    scanner.add(every15Min('2026-01-01T00:00:00Z', '2026-01-01T06:00:00Z'));
    scanner.add(every15Min('2026-01-01T07:30:00Z', '2026-01-02T00:00:00Z'));
    expect(scanner.finish(t('2026-01-02T00:00:00Z'))).toEqual([]);
  });

  it('reports missing data at the start and end of the range', () => {
    const scanner = new GapScanner(sid, t('2026-01-01T00:00:00Z'), 2 * HOUR);
    scanner.add(every15Min('2026-01-01T10:00:00Z', '2026-01-01T12:00:00Z'));
    const gaps = scanner.finish(t('2026-01-02T00:00:00Z'));
    expect(gaps.map((g) => [g.from.toISOString(), g.to.toISOString()])).toEqual([
      ['2026-01-01T00:00:00.000Z', '2026-01-01T10:00:00.000Z'],
      ['2026-01-01T12:00:00.000Z', '2026-01-02T00:00:00.000Z'],
    ]);
  });
});
