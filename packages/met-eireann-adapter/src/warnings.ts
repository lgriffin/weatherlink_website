import type { WarningLevel, WarningsSource, WeatherWarning } from '@weather/domain';

/**
 * Met Éireann's current weather warnings for Ireland, from their open data
 * (Copyright Met Éireann, CC BY 4.0). Their licence asks any site that shows
 * Met Éireann forecasts to show these warnings too.
 *
 * Answers are kept for a few minutes so a busy page doesn't hit Met Éireann
 * on every request, and a failure for a couple of minutes so a busy page
 * doesn't wait on it either.
 */
export const WARNINGS_URL = 'https://www.met.ie/Open_Data/json/warning_IRELAND.json';

type Fetch = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) =>
  Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface MetEireannWarningsOptions {
  url?: string;
  fetch?: Fetch;
  cacheMs?: number;
  /** After a failure, how long to answer "unreachable" without asking again. */
  retryMs?: number;
  timeoutMs?: number;
  now?: () => number;
}

function level(value: unknown): WarningLevel {
  const v = String(value ?? '').toLowerCase();
  return v === 'yellow' || v === 'orange' || v === 'red' ? v : 'unknown';
}

function date(value: unknown): Date | null {
  if (typeof value !== 'string' || !value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** One warning from the feed; fields Met Éireann leaves out stay empty rather than failing. */
export function parseWarning(raw: Record<string, unknown>): WeatherWarning {
  return {
    level: level(raw['level']),
    type: String(raw['type'] ?? raw['event'] ?? ''),
    headline: String(raw['headline'] ?? ''),
    description: String(raw['description'] ?? ''),
    onset: date(raw['onset']),
    expiry: date(raw['expiry']),
    regions: Array.isArray(raw['regions']) ? raw['regions'].map(String) : [],
  };
}

export class MetEireannWarnings implements WarningsSource {
  private cached: { at: number; warnings: WeatherWarning[] } | null = null;
  private failedAt: number | null = null;
  private inFlight: Promise<WeatherWarning[]> | null = null;
  private readonly url: string;
  private readonly fetch: Fetch;
  private readonly cacheMs: number;
  private readonly retryMs: number;
  private readonly timeoutMs: number;
  private readonly now: () => number;

  constructor(options: MetEireannWarningsOptions = {}) {
    this.url = options.url ?? WARNINGS_URL;
    this.fetch = options.fetch ?? (globalThis.fetch as unknown as Fetch);
    this.cacheMs = options.cacheMs ?? 10 * 60_000;
    this.retryMs = options.retryMs ?? 2 * 60_000;
    this.timeoutMs = options.timeoutMs ?? 5_000;
    this.now = options.now ?? Date.now;
  }

  /** Warnings in force or coming up (Met Éireann issues them ahead of their onset), never expired ones. */
  async current(): Promise<WeatherWarning[]> {
    const now = this.now();
    if (this.cached && now - this.cached.at < this.cacheMs) return this.unexpired(this.cached.warnings);
    // After a failure, say so straight away for a little while rather than make every visitor wait.
    if (this.failedAt !== null && now - this.failedAt < this.retryMs) {
      throw new Error('Met Éireann warnings were unreachable a moment ago');
    }
    // Visitors arriving together share one request.
    this.inFlight ??= this.download().finally(() => { this.inFlight = null; });
    return this.unexpired(await this.inFlight);
  }

  private unexpired(warnings: WeatherWarning[]): WeatherWarning[] {
    const now = this.now();
    return warnings.filter((w) => !w.expiry || w.expiry.getTime() > now);
  }

  private async download(): Promise<WeatherWarning[]> {
    try {
      const res = await this.fetch(this.url, {
        headers: { 'user-agent': 'weatherlink_website (+https://github.com/lgriffin/weatherlink_website)' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) throw new Error(`Met Éireann warnings answered ${res.status}`);
      const body = await res.json();
      // The feed is a list (empty when nothing is in force); anything else is not "no warnings".
      if (!Array.isArray(body)) throw new Error('Met Éireann warnings feed was not a list');
      const warnings = body
        .filter((w): w is Record<string, unknown> => typeof w === 'object' && w !== null)
        .map(parseWarning);
      this.cached = { at: this.now(), warnings };
      this.failedAt = null;
      return warnings;
    } catch (err) {
      this.failedAt = this.now();
      throw err;
    }
  }
}
