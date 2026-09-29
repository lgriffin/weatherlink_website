const MS_PER_DAY = 86_400_000;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

function wallClockParts(instant: Date, timeZone: string): Record<string, number> {
  const parts: Record<string, number> = {};
  for (const p of formatterFor(timeZone).formatToParts(instant)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  return parts;
}

/** Offset of the zone from UTC at the given instant, in milliseconds. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const p = wallClockParts(instant, timeZone);
  const asUtc = Date.UTC(p['year']!, p['month']! - 1, p['day']!, p['hour']!, p['minute']!, p['second']!);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Calendar date (YYYY-MM-DD) of an instant in the given time zone. */
export function localDateOf(instant: Date, timeZone: string): string {
  const p = wallClockParts(instant, timeZone);
  return `${p['year']}-${String(p['month']).padStart(2, '0')}-${String(p['day']).padStart(2, '0')}`;
}

/** Shift a YYYY-MM-DD date by whole days. */
export function addDays(date: string, days: number): string {
  const t = Date.parse(`${date}T00:00:00Z`) + days * MS_PER_DAY;
  return new Date(t).toISOString().substring(0, 10);
}

function localMidnight(date: string, timeZone: string): Date {
  const guess = Date.parse(`${date}T00:00:00Z`);
  let t = guess - zoneOffsetMs(new Date(guess), timeZone);
  const corrected = guess - zoneOffsetMs(new Date(t), timeZone);
  if (corrected !== t) t = corrected;
  return new Date(t);
}

/**
 * The instants bounding a local calendar day: [start, end), where end is the
 * next local midnight. Days are 23 or 25 hours long on clock-change dates.
 */
export function localDayBounds(date: string, timeZone: string): { start: Date; end: Date } {
  return {
    start: localMidnight(date, timeZone),
    end: localMidnight(addDays(date, 1), timeZone),
  };
}
