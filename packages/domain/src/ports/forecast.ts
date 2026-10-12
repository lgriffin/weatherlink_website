import type { IssuedForecast, WeatherWarning } from '../types/forecast.js';

export interface ForecastRepository {
  /** The newest forecast received, or null when none has arrived. */
  findLatest(): Promise<IssuedForecast | null>;
}

export interface WarningsSource {
  /** Warnings in force now or issued for later, not expired ones. Throws when the issuer can't be reached. */
  current(): Promise<WeatherWarning[]>;
}
