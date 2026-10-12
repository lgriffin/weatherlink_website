import type { WarningLevel, WarningsSource, WeatherWarning } from '@weather/domain';

/**
 * Met Éireann's current weather warnings for Ireland, from their open data
 * (Copyright Met Éireann, CC BY 4.0). Their licence asks any site that shows
 * Met Éireann forecasts to show these warnings too.
 *
 * Answers are kept for a few minutes so a busy page doesn't hit Met Éireann
 * on every request.
 */
export const WARNINGS_URL = 'https://www.met.ie/Open_Data/json/warning_IRELAND.json';

type Fetch = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) =>
  Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface MetEireannWarningsOptions {
  url?: string;
  fetch?: Fetch;
  cacheMs?: number;
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
  private readonly url: string;
  private readonly fetch: Fetch;
  private readonly cacheMs: number;
  private readonly timeoutMs: number;
  private readonly now: () => number;

  constructor(options: MetEireannWarningsOptions = {}) {
    this.url = options.url ?? WARNINGS_URL;
    this.fetch = options.fetch ?? (globalThis.fetch as unknown as Fetch);
    this.cacheMs = options.cacheMs ?? 10 * 60_000;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.now = options.now ?? Date.now;
  }

  async current(): Promise<WeatherWarning[]> {
    if (this.cached && this.now() - this.cached.at < this.cacheMs) return this.cached.warnings;
    const res = await this.fetch(this.url, {
      headers: { 'user-agent': 'weatherlink_website (+https://github.com/lgriffin/weatherlink_website)' },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`Met Éireann warnings answered ${res.status}`);
    const body = await res.json();
    const list = Array.isArray(body) ? body : [];
    const now = this.now();
    const warnings = list
      .filter((w): w is Record<string, unknown> => typeof w === 'object' && w !== null)
      .map(parseWarning)
      .filter((w) => !w.expiry || w.expiry.getTime() > now);
    this.cached = { at: now, warnings };
    return warnings;
  }
}
