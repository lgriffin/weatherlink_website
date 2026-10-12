import { localDateOf } from '@weather/domain';
import type { Clock, ForecastRepository, IssuedForecast, WarningsSource, WeatherWarning } from '@weather/domain';

/** Tonight's forecast is due soon after 18:00 local; from this local hour it is overdue. */
export const FORECAST_DUE_BY_HOUR = 20;
/** Without an evening date to go on, a forecast received longer ago than this is out of date. */
export const FORECAST_STALE_AFTER_HOURS = 30;

export interface ForecastResult {
  readonly forecast: (IssuedForecast & { readonly stale: boolean }) | null;
  /** Warnings in force or coming up; null when they could not be fetched (the page says so rather than "none"). */
  readonly warnings: WeatherWarning[] | null;
}

export interface GetForecastOptions {
  /** The station's time zone: forecasts are made for its local evenings. */
  readonly timeZone?: string;
  /** Told when the warnings can't be fetched, so the reason is logged. */
  readonly onWarningsError?: (err: unknown) => void;
}

function eveningDate(payload: unknown): string | null {
  const date = (payload as { evening?: { date?: unknown } } | null)?.evening?.date;
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

export class GetForecast {
  private readonly timeZone: string;

  constructor(
    private readonly forecasts: ForecastRepository,
    private readonly warnings: WarningsSource,
    private readonly clock: Clock,
    private readonly options: GetForecastOptions = {},
  ) {
    this.timeZone = options.timeZone ?? 'Europe/Dublin';
  }

  async execute(): Promise<ForecastResult> {
    const [latest, warnings] = await Promise.all([
      this.forecasts.findLatest(),
      this.warnings.current().catch((err: unknown) => {
        this.options.onWarningsError?.(err);
        return null;
      }),
    ]);
    return { forecast: latest ? { ...latest, stale: this.isStale(latest) } : null, warnings };
  }

  /** Out of date once the next evening's forecast is overdue (judged by the evening it was made for, so a
   * re-sent copy of an old forecast doesn't look new). */
  private isStale(forecast: IssuedForecast): boolean {
    const now = this.clock.now();
    const evening = eveningDate(forecast.payload);
    if (evening === null) {
      return now.getTime() - forecast.receivedAt.getTime() > FORECAST_STALE_AFTER_HOURS * 3_600_000;
    }
    // The latest evening that should have a forecast by now: today from 20:00 local, else yesterday.
    const expected = localDateOf(new Date(now.getTime() - FORECAST_DUE_BY_HOUR * 3_600_000), this.timeZone);
    return evening < expected;
  }
}
