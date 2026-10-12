import type { Clock, ForecastRepository, IssuedForecast, WarningsSource, WeatherWarning } from '@weather/domain';

/** A forecast older than this is shown as out of date: tonight's has not arrived. */
export const FORECAST_STALE_AFTER_HOURS = 30;

export interface ForecastResult {
  readonly forecast: (IssuedForecast & { readonly stale: boolean }) | null;
  /** null when the warnings could not be fetched (the page says so rather than "none"). */
  readonly warnings: WeatherWarning[] | null;
}

export class GetForecast {
  constructor(
    private readonly forecasts: ForecastRepository,
    private readonly warnings: WarningsSource,
    private readonly clock: Clock,
    private readonly staleAfterHours = FORECAST_STALE_AFTER_HOURS,
  ) {}

  async execute(): Promise<ForecastResult> {
    const [latest, warnings] = await Promise.all([
      this.forecasts.findLatest(),
      this.warnings.current().catch(() => null),
    ]);
    const age = latest ? this.clock.now().getTime() - latest.receivedAt.getTime() : 0;
    return {
      forecast: latest ? { ...latest, stale: age > this.staleAfterHours * 3_600_000 } : null,
      warnings,
    };
  }
}
