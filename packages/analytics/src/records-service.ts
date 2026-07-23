import type { DailySummary, WeatherRecord, StationId, MeasurementName, CanonicalUnit, RecordScope, RecordType } from '@weather/domain';

interface RecordCandidate {
  value: number;
  date: string;
}

export function deriveRecords(
  stationId: StationId,
  summaries: readonly DailySummary[],
): WeatherRecord[] {
  const byMeasurement = new Map<string, { summaries: DailySummary[]; unit: CanonicalUnit; name: MeasurementName }>();

  for (const s of summaries) {
    let entry = byMeasurement.get(s.measurementName);
    if (!entry) {
      entry = { summaries: [], unit: s.unit, name: s.measurementName };
      byMeasurement.set(s.measurementName, entry);
    }
    entry.summaries.push(s);
  }

  const records: WeatherRecord[] = [];

  for (const [, entry] of byMeasurement) {
    const { summaries: measurementSummaries, unit, name } = entry;

    const allTimeRecords = computeScopeRecords(
      stationId, name, unit, 'all-time', '',
      measurementSummaries,
    );
    records.push(...allTimeRecords);

    const byYear = groupBy(measurementSummaries, (s) => s.date.substring(0, 4));
    for (const [year, yearSummaries] of byYear) {
      records.push(...computeScopeRecords(stationId, name, unit, 'yearly', year, yearSummaries));
    }

    const byMonth = groupBy(measurementSummaries, (s) => s.date.substring(5, 7));
    for (const [month, monthSummaries] of byMonth) {
      records.push(...computeScopeRecords(stationId, name, unit, 'monthly', month, monthSummaries));
    }
  }

  return records;
}

function computeScopeRecords(
  stationId: StationId,
  measurementName: MeasurementName,
  unit: CanonicalUnit,
  scope: RecordScope,
  scopeKey: string,
  summaries: DailySummary[],
): WeatherRecord[] {
  const results: WeatherRecord[] = [];

  let highCandidate: RecordCandidate | null = null;
  let lowCandidate: RecordCandidate | null = null;

  for (const s of summaries) {
    if (s.max !== null && (highCandidate === null || s.max > highCandidate.value)) {
      highCandidate = { value: s.max, date: s.date };
    }
    if (s.min !== null && (lowCandidate === null || s.min < lowCandidate.value)) {
      lowCandidate = { value: s.min, date: s.date };
    }
  }

  if (highCandidate) {
    results.push({
      stationId, measurementName, unit, scope, scopeKey,
      recordType: 'high', value: highCandidate.value, date: highCandidate.date,
    });
  }

  if (lowCandidate) {
    results.push({
      stationId, measurementName, unit, scope, scopeKey,
      recordType: 'low', value: lowCandidate.value, date: lowCandidate.date,
    });
  }

  return results;
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    let group = map.get(key);
    if (!group) {
      group = [];
      map.set(key, group);
    }
    group.push(item);
  }
  return map;
}
