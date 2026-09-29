import { describe, it, expect } from 'vitest';
import { localDateOf, localDayBounds, addDays } from './local-date.js';

describe('local dates', () => {
  it('puts late-evening UTC instants on the next Irish day in summer', () => {
    expect(localDateOf(new Date('2026-07-01T23:30:00Z'), 'Europe/Dublin')).toBe('2026-07-02');
    expect(localDateOf(new Date('2026-01-01T23:30:00Z'), 'Europe/Dublin')).toBe('2026-01-01');
  });

  it('bounds a summer day at local midnight (UTC+1)', () => {
    const { start, end } = localDayBounds('2026-07-01', 'Europe/Dublin');
    expect(start.toISOString()).toBe('2026-06-30T23:00:00.000Z');
    expect(end.toISOString()).toBe('2026-07-01T23:00:00.000Z');
  });

  it('bounds a winter day at UTC midnight', () => {
    const { start, end } = localDayBounds('2026-01-15', 'Europe/Dublin');
    expect(start.toISOString()).toBe('2026-01-15T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-01-16T00:00:00.000Z');
  });

  it('handles the 23-hour spring-forward day', () => {
    const { start, end } = localDayBounds('2026-03-29', 'Europe/Dublin');
    expect(end.getTime() - start.getTime()).toBe(23 * 3600_000);
  });

  it('handles the 25-hour fall-back day', () => {
    const { start, end } = localDayBounds('2026-10-25', 'Europe/Dublin');
    expect(end.getTime() - start.getTime()).toBe(25 * 3600_000);
  });

  it('adds days across month ends', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
