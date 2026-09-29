import { describe, it, expect } from 'vitest';
import { deriveDerivedRecords } from './derived-records-service.js';
import { aDailySummary } from '@weather/test-support';
import { stationId } from '@weather/domain';
import type { MeasurementName, CanonicalUnit } from '@weather/domain';

const sid = stationId('station-1');

function rainSummary(date: string, maxRain: number) {
  return aDailySummary({
    date,
    measurementName: 'rain.daily' as MeasurementName,
    unit: 'mm' as CanonicalUnit,
    min: 0,
    max: maxRain,
    avg: maxRain / 2,
    count: 96,
  });
}

function tempSummary(date: string, min: number, max: number) {
  return aDailySummary({
    date,
    measurementName: 'temperature.outdoor' as MeasurementName,
    unit: 'celsius' as CanonicalUnit,
    min,
    max,
    avg: (min + max) / 2,
    count: 96,
  });
}

describe('deriveDerivedRecords', () => {
  it('returns empty for empty input', () => {
    expect(deriveDerivedRecords(sid, [])).toEqual([]);
  });

  it('computes consecutive dry days streak', () => {
    const summaries = [
      rainSummary('2026-07-01', 0),
      rainSummary('2026-07-02', 0),
      rainSummary('2026-07-03', 0),
      rainSummary('2026-07-04', 5),
      rainSummary('2026-07-05', 0),
      tempSummary('2026-07-01', 10, 20),
      tempSummary('2026-07-02', 10, 20),
      tempSummary('2026-07-03', 10, 20),
      tempSummary('2026-07-04', 10, 20),
      tempSummary('2026-07-05', 10, 20),
    ];

    const records = deriveDerivedRecords(sid, summaries);
    const dryStreak = records.find((r) => r.description === 'Consecutive dry days');

    expect(dryStreak).toBeDefined();
    expect(dryStreak!.value).toBe(3);
    expect(dryStreak!.date).toBe('2026-07-03');
    expect(dryStreak!.recordType).toBe('streak');
  });

  it('excludes days without temperature data from rain streaks', () => {
    const summaries = [
      rainSummary('2026-07-01', 0),
      rainSummary('2026-07-02', 0),
      rainSummary('2026-07-03', 0),
      tempSummary('2026-07-01', 10, 20),
      // Jul 02 + 03 have no temperature — ISS was down
    ];

    const records = deriveDerivedRecords(sid, summaries);
    const dryStreak = records.find((r) => r.description === 'Consecutive dry days');

    expect(dryStreak).toBeDefined();
    expect(dryStreak!.value).toBe(1);
  });

  it('does not let a dry streak bridge missing days', () => {
    const summaries = [
      rainSummary('2026-07-01', 0), tempSummary('2026-07-01', 10, 20),
      rainSummary('2026-07-02', 0), tempSummary('2026-07-02', 10, 20),
      // 3-9 July missing: hardware outage
      rainSummary('2026-07-10', 0), tempSummary('2026-07-10', 10, 20),
      rainSummary('2026-07-11', 0), tempSummary('2026-07-11', 10, 20),
      rainSummary('2026-07-12', 0), tempSummary('2026-07-12', 10, 20),
    ];

    const records = deriveDerivedRecords(sid, summaries);
    const dryStreak = records.find((r) => r.description === 'Consecutive dry days');

    expect(dryStreak!.value).toBe(3);
    expect(dryStreak!.date).toBe('2026-07-12');
  });

  it('computes consecutive rainy days streak', () => {
    const summaries = [
      rainSummary('2026-07-01', 2),
      rainSummary('2026-07-02', 1),
      rainSummary('2026-07-03', 3),
      rainSummary('2026-07-04', 0),
      tempSummary('2026-07-01', 10, 20),
      tempSummary('2026-07-02', 10, 20),
      tempSummary('2026-07-03', 10, 20),
      tempSummary('2026-07-04', 10, 20),
    ];

    const records = deriveDerivedRecords(sid, summaries);
    const rainyStreak = records.find((r) => r.description === 'Consecutive rainy days');

    expect(rainyStreak).toBeDefined();
    expect(rainyStreak!.value).toBe(3);
  });

  it('counts days over 20°C', () => {
    const summaries = [
      tempSummary('2026-07-01', 10, 22),
      tempSummary('2026-07-02', 10, 18),
      tempSummary('2026-07-03', 15, 25),
    ];

    const records = deriveDerivedRecords(sid, summaries);
    const over20 = records.find((r) => r.description === 'Days reaching 20°C or above');

    expect(over20).toBeDefined();
    expect(over20!.value).toBe(2);
    expect(over20!.recordType).toBe('count');
  });

  it('computes largest daily temperature swing', () => {
    const summaries = [
      tempSummary('2026-07-01', 10, 22),
      tempSummary('2026-07-02', 5, 30),
      tempSummary('2026-07-03', 15, 20),
    ];

    const records = deriveDerivedRecords(sid, summaries);
    const swing = records.find((r) => r.description === 'Largest daily temperature swing');

    expect(swing).toBeDefined();
    expect(swing!.value).toBe(25);
    expect(swing!.date).toBe('2026-07-02');
    expect(swing!.recordType).toBe('derived');
  });

  it('computes wettest single day', () => {
    const summaries = [
      rainSummary('2026-07-01', 5),
      rainSummary('2026-07-02', 15),
      rainSummary('2026-07-03', 8),
    ];

    const records = deriveDerivedRecords(sid, summaries);
    const wettest = records.find((r) => r.description === 'Wettest single day');

    expect(wettest).toBeDefined();
    expect(wettest!.value).toBe(15);
    expect(wettest!.date).toBe('2026-07-02');
  });
});
