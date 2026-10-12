/**
 * The station's own forecast, made on the model machine (or in GitHub Actions)
 * and received through the ingest API. The payload is the forecasting code's
 * output, opaque to the domain; the contracts package gives it a shape.
 */
export interface IssuedForecast {
  /** Machine or job that sent it. */
  readonly source: string;
  readonly receivedAt: Date;
  readonly payload: unknown;
}

export type WarningLevel = 'yellow' | 'orange' | 'red' | 'unknown';

/** A weather warning in force, from the national weather service. */
export interface WeatherWarning {
  readonly level: WarningLevel;
  /** "Wind", "Rain", "Low temperature/Ice"... */
  readonly type: string;
  readonly headline: string;
  readonly description: string;
  readonly onset: Date | null;
  readonly expiry: Date | null;
  /** Region codes as the issuer names them (counties, sea areas). */
  readonly regions: readonly string[];
}
