import type { DailySummary, WeatherRecord, StationId, MeasurementName, CanonicalUnit } from '@weather/domain';

export function deriveDerivedRecords(
  stationId: StationId,
  summaries: readonly DailySummary[],
): WeatherRecord[] {
  const records: WeatherRecord[] = [];

  const byMeasurement = groupByMeasurement(summaries);

  const rainDaily = byMeasurement.get('rain.daily');
  if (rainDaily) {
    const sorted = [...rainDaily].sort((a, b) => a.date.localeCompare(b.date));

    // Days where the ISS was fully operational (has temperature data)
    // Rain data without temperature means the ISS was malfunctioning
    const validDates = new Set(
      (byMeasurement.get('temperature.outdoor') ?? []).map((s) => s.date),
    );
    const validated = sorted.filter((s) => validDates.has(s.date));

    const dryStreak = longestStreak(validated, (s) => s.max === null || s.max === 0);
    if (dryStreak) {
      records.push(makeRecord(stationId, 'rain.daily', 'mm', 'streak', dryStreak.length, dryStreak.endDate, 'Consecutive dry days'));
    }

    const rainyStreak = longestStreak(validated, (s) => s.max !== null && s.max > 0);
    if (rainyStreak) {
      records.push(makeRecord(stationId, 'rain.daily', 'mm', 'streak', rainyStreak.length, rainyStreak.endDate, 'Consecutive rainy days'));
    }

    const wettest = findMaxDay(sorted, (s) => s.max);
    if (wettest) {
      records.push(makeRecord(stationId, 'rain.daily', 'mm', 'derived', wettest.value, wettest.date, 'Wettest single day'));
    }
  }

  const tempOutdoor = byMeasurement.get('temperature.outdoor');
  if (tempOutdoor) {
    const sorted = [...tempOutdoor].sort((a, b) => a.date.localeCompare(b.date));

    const over20 = sorted.filter((s) => s.max !== null && s.max >= 20).length;
    if (over20 > 0) {
      records.push(makeRecord(stationId, 'temperature.outdoor', 'celsius', 'count', over20, '', 'Days reaching 20°C or above'));
    }

    const below0 = sorted.filter((s) => s.min !== null && s.min <= 0).length;
    if (below0 > 0) {
      records.push(makeRecord(stationId, 'temperature.outdoor', 'celsius', 'count', below0, '', 'Days at or below freezing'));
    }

    const hotStreak = longestStreak(sorted, (s) => s.max !== null && s.max >= 20);
    if (hotStreak && hotStreak.length > 1) {
      records.push(makeRecord(stationId, 'temperature.outdoor', 'celsius', 'streak', hotStreak.length, hotStreak.endDate, 'Consecutive days reaching 20°C'));
    }

    const coldStreak = longestStreak(sorted, (s) => s.min !== null && s.min <= 0);
    if (coldStreak && coldStreak.length > 1) {
      records.push(makeRecord(stationId, 'temperature.outdoor', 'celsius', 'streak', coldStreak.length, coldStreak.endDate, 'Consecutive freezing days'));
    }

    let maxRange: { value: number; date: string } | null = null;
    for (const s of sorted) {
      if (s.max !== null && s.min !== null) {
        const range = s.max - s.min;
        if (!maxRange || range > maxRange.value) {
          maxRange = { value: Math.round(range * 100) / 100, date: s.date };
        }
      }
    }
    if (maxRange) {
      records.push(makeRecord(stationId, 'temperature.outdoor', 'celsius', 'derived', maxRange.value, maxRange.date, 'Largest daily temperature swing'));
    }
  }

  const windGust = byMeasurement.get('wind.gust');
  if (windGust) {
    const windiest = findMaxDay(windGust, (s) => s.max);
    if (windiest) {
      records.push(makeRecord(stationId, 'wind.gust', 'm/s', 'derived', windiest.value, windiest.date, 'Windiest day (peak gust)'));
    }
  }

  const humidity = byMeasurement.get('humidity.outdoor');
  if (humidity) {
    const mostHumid = findMaxDay(humidity, (s) => s.avg);
    if (mostHumid) {
      records.push(makeRecord(stationId, 'humidity.outdoor', 'percent', 'derived', Math.round(mostHumid.value * 10) / 10, mostHumid.date, 'Most humid day (avg)'));
    }
  }

  return records;
}

function makeRecord(
  stationId: StationId,
  measurementName: string,
  unit: string,
  recordType: 'streak' | 'count' | 'derived',
  value: number,
  date: string,
  description: string,
): WeatherRecord {
  return {
    stationId,
    measurementName: measurementName as MeasurementName,
    unit: unit as CanonicalUnit,
    scope: 'all-time',
    scopeKey: '',
    recordType,
    value,
    date,
    description,
  };
}

interface StreakResult {
  length: number;
  startDate: string;
  endDate: string;
}

function nextDate(date: string): string {
  const t = Date.parse(`${date}T00:00:00Z`) + 86_400_000;
  return new Date(t).toISOString().substring(0, 10);
}

/**
 * Longest run of consecutive calendar days matching the predicate. A missing
 * day (for example a hardware outage) ends the run rather than being skipped.
 */
function longestStreak(
  sorted: DailySummary[],
  predicate: (s: DailySummary) => boolean,
): StreakResult | null {
  let best: StreakResult | null = null;
  let currentLength = 0;
  let currentStart = '';
  let previousDate = '';

  for (const s of sorted) {
    if (currentLength > 0 && s.date !== nextDate(previousDate)) {
      currentLength = 0;
    }
    previousDate = s.date;

    if (predicate(s)) {
      if (currentLength === 0) currentStart = s.date;
      currentLength++;
      if (!best || currentLength > best.length) {
        best = { length: currentLength, startDate: currentStart, endDate: s.date };
      }
    } else {
      currentLength = 0;
    }
  }

  return best;
}

function findMaxDay(
  summaries: readonly DailySummary[],
  getter: (s: DailySummary) => number | null,
): { value: number; date: string } | null {
  let best: { value: number; date: string } | null = null;
  for (const s of summaries) {
    const v = getter(s);
    if (v !== null && (!best || v > best.value)) {
      best = { value: v, date: s.date };
    }
  }
  return best;
}

function groupByMeasurement(summaries: readonly DailySummary[]): Map<string, DailySummary[]> {
  const map = new Map<string, DailySummary[]>();
  for (const s of summaries) {
    let list = map.get(s.measurementName);
    if (!list) {
      list = [];
      map.set(s.measurementName, list);
    }
    list.push(s);
  }
  return map;
}
