import type { Observation, DailySummary, StationId, MeasurementName, CanonicalUnit } from '@weather/domain';
import { MEASUREMENT_UNITS } from '@weather/domain';

/**
 * Archive intervals carry their own high and low. A day's max and min must
 * include them, otherwise short peaks between averages are lost.
 */
const EXTREME_COMPANIONS: Record<string, { high: string; low?: string }> = {
  'temperature.outdoor': { high: 'temperature.outdoorHigh', low: 'temperature.outdoorLow' },
  'temperature.dewPoint': { high: 'temperature.dewPointHigh', low: 'temperature.dewPointLow' },
  'humidity.outdoor': { high: 'humidity.outdoorHigh', low: 'humidity.outdoorLow' },
  'solar.radiation': { high: 'solar.radiationHigh' },
  'uv.index': { high: 'uv.indexHigh' },
};

const COMPANION_NAMES = new Set(
  Object.values(EXTREME_COMPANIONS).flatMap((c) => (c.low ? [c.high, c.low] : [c.high])),
);

/**
 * Per-interval amounts that make a daily total when summed. The total is stored
 * as the summary's max (the same place a running daily total peaks), with min
 * and avg left null.
 */
const SUMMED: Record<string, MeasurementName> = {
  'rain.interval': 'rain.daily',
  'wind.run': 'wind.run',
  'evapotranspiration': 'evapotranspiration',
  'degreeDays.heating': 'degreeDays.heating',
  'degreeDays.cooling': 'degreeDays.cooling',
};

interface Accumulator {
  name: MeasurementName;
  unit: CanonicalUnit;
  values: number[];
  highs: number[];
  lows: number[];
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function computeDailySummaries(
  stationId: StationId,
  date: string,
  observations: readonly Observation[],
): DailySummary[] {
  const byMeasurement = new Map<string, Accumulator>();
  const sums = new Map<string, { total: number; count: number }>();

  const accumulatorFor = (name: string, unit: CanonicalUnit): Accumulator => {
    let entry = byMeasurement.get(name);
    if (!entry) {
      entry = { name: name as MeasurementName, unit, values: [], highs: [], lows: [] };
      byMeasurement.set(name, entry);
    }
    return entry;
  };

  for (const obs of observations) {
    for (const [key, m] of obs.measurements) {
      if (m.value === null) continue;

      if (key in SUMMED) {
        const s = sums.get(key) ?? { total: 0, count: 0 };
        s.total += m.value;
        s.count += 1;
        sums.set(key, s);
        continue;
      }

      if (COMPANION_NAMES.has(key)) continue;
      accumulatorFor(key, m.unit).values.push(m.value);

      const companions = EXTREME_COMPANIONS[key];
      if (companions) {
        const hi = obs.measurements.get(companions.high)?.value;
        if (hi != null) accumulatorFor(key, m.unit).highs.push(hi);
        const lo = companions.low ? obs.measurements.get(companions.low)?.value : null;
        if (lo != null) accumulatorFor(key, m.unit).lows.push(lo);
      }
    }
  }

  const summaries = new Map<string, DailySummary>();

  for (const [, entry] of byMeasurement) {
    const { values, highs, lows, unit, name } = entry;
    if (values.length === 0) continue;

    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;

    summaries.set(name, {
      stationId,
      date,
      measurementName: name,
      unit,
      min: Math.min(...values, ...lows),
      max: Math.max(...values, ...highs),
      avg: round2(avg),
      count: values.length,
    });
  }

  for (const [source, { total, count }] of sums) {
    const target = SUMMED[source]!;
    summaries.set(target, {
      stationId,
      date,
      measurementName: target,
      unit: MEASUREMENT_UNITS[target] ?? 'mm',
      min: null,
      max: round2(total),
      avg: null,
      count,
    });
  }

  return [...summaries.values()];
}
