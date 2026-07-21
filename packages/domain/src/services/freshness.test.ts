import { describe, it, expect } from 'vitest';
import { determineFreshness } from './freshness.js';
import type { FreshnessConfig } from '../types/freshness.js';

const config: FreshnessConfig = {
  delayedAfterSeconds: 300,
  staleAfterSeconds: 900,
};

describe('determineFreshness', () => {
  it('returns unavailable when no observation exists', () => {
    const result = determineFreshness(null, new Date(), config);
    expect(result.state).toBe('unavailable');
    expect(result.lastObservation).toBeNull();
    expect(result.ageSeconds).toBeNull();
  });

  it('returns live when observation is recent', () => {
    const now = new Date('2026-07-17T14:05:00Z');
    const observed = new Date('2026-07-17T14:04:00Z');
    const result = determineFreshness(observed, now, config);
    expect(result.state).toBe('live');
    expect(result.ageSeconds).toBe(60);
    expect(result.lastObservation).toBe(observed);
  });

  it('returns live at exact delayed boundary', () => {
    const now = new Date('2026-07-17T14:05:00Z');
    const observed = new Date(now.getTime() - 300_000);
    const result = determineFreshness(observed, now, config);
    expect(result.state).toBe('live');
  });

  it('returns delayed when past delayed threshold', () => {
    const now = new Date('2026-07-17T14:05:00Z');
    const observed = new Date(now.getTime() - 301_000);
    const result = determineFreshness(observed, now, config);
    expect(result.state).toBe('delayed');
    expect(result.ageSeconds).toBe(301);
  });

  it('returns delayed at exact stale boundary', () => {
    const now = new Date('2026-07-17T14:05:00Z');
    const observed = new Date(now.getTime() - 900_000);
    const result = determineFreshness(observed, now, config);
    expect(result.state).toBe('delayed');
  });

  it('returns stale when past stale threshold', () => {
    const now = new Date('2026-07-17T14:05:00Z');
    const observed = new Date(now.getTime() - 901_000);
    const result = determineFreshness(observed, now, config);
    expect(result.state).toBe('stale');
  });

  it('returns live when observation is in the future', () => {
    const now = new Date('2026-07-17T14:00:00Z');
    const observed = new Date('2026-07-17T14:01:00Z');
    const result = determineFreshness(observed, now, config);
    expect(result.state).toBe('live');
    expect(result.ageSeconds).toBe(0);
  });

  it('uses default config when none provided', () => {
    const now = new Date('2026-07-17T14:05:00Z');
    const observed = new Date(now.getTime() - 60_000);
    const result = determineFreshness(observed, now);
    expect(result.state).toBe('live');
  });
});
