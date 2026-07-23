import { describe, it, expect } from 'vitest';
import { deriveRecords } from './records-service.js';
import { aDailySummary } from '@weather/test-support';
import { stationId } from '@weather/domain';

describe('deriveRecords', () => {
  const sid = stationId('station-1');

  it('derives all-time high and low records', () => {
    const summaries = [
      aDailySummary({ date: '2025-01-15', min: 5, max: 15 }),
      aDailySummary({ date: '2025-07-15', min: 12, max: 30 }),
      aDailySummary({ date: '2026-07-17', min: 10, max: 25 }),
    ];

    const records = deriveRecords(sid, summaries);

    const allTimeHigh = records.find((r) => r.scope === 'all-time' && r.recordType === 'high');
    expect(allTimeHigh).toBeDefined();
    expect(allTimeHigh!.value).toBe(30);
    expect(allTimeHigh!.date).toBe('2025-07-15');

    const allTimeLow = records.find((r) => r.scope === 'all-time' && r.recordType === 'low');
    expect(allTimeLow).toBeDefined();
    expect(allTimeLow!.value).toBe(5);
  });

  it('derives yearly records', () => {
    const summaries = [
      aDailySummary({ date: '2025-01-15', min: 5, max: 15 }),
      aDailySummary({ date: '2025-07-15', min: 12, max: 30 }),
      aDailySummary({ date: '2026-07-17', min: 10, max: 25 }),
    ];

    const records = deriveRecords(sid, summaries);

    const yearly2025High = records.find(
      (r) => r.scope === 'yearly' && r.scopeKey === '2025' && r.recordType === 'high',
    );
    expect(yearly2025High).toBeDefined();
    expect(yearly2025High!.value).toBe(30);
  });

  it('derives monthly records', () => {
    const summaries = [
      aDailySummary({ date: '2025-07-15', min: 12, max: 30 }),
      aDailySummary({ date: '2026-07-17', min: 10, max: 25 }),
    ];

    const records = deriveRecords(sid, summaries);

    const julyHigh = records.find(
      (r) => r.scope === 'monthly' && r.scopeKey === '07' && r.recordType === 'high',
    );
    expect(julyHigh).toBeDefined();
    expect(julyHigh!.value).toBe(30);
  });

  it('returns empty for no summaries', () => {
    const records = deriveRecords(sid, []);
    expect(records).toHaveLength(0);
  });
});
