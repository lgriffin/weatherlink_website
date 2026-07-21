import { z } from 'zod';
import type { Logger } from '@weather/observability';
import { WeatherLinkStationsResponseSchema, type WeatherLinkStationsResponse } from './schemas/stations.js';
import { WeatherLinkCurrentResponseSchema, type WeatherLinkCurrentResponse } from './schemas/current.js';
import { WeatherLinkSensorsResponseSchema, type WeatherLinkSensorsResponse } from './schemas/sensors.js';

export class WeatherLinkClient {
  constructor(
    private readonly apiKey: string,
    private readonly apiSecret: string,
    private readonly baseUrl: string,
    private readonly logger: Logger,
  ) {}

  async getStations(): Promise<WeatherLinkStationsResponse> {
    const url = `${this.baseUrl}/stations`;
    return this.request(url, WeatherLinkStationsResponseSchema);
  }

  async getCurrentConditions(stationId: number): Promise<WeatherLinkCurrentResponse> {
    const url = `${this.baseUrl}/current/${stationId}`;
    return this.request(url, WeatherLinkCurrentResponseSchema);
  }

  async getSensors(): Promise<WeatherLinkSensorsResponse> {
    const url = `${this.baseUrl}/sensors`;
    return this.request(url, WeatherLinkSensorsResponseSchema);
  }

  private async request<T>(url: string, schema: z.ZodSchema<T>): Promise<T> {
    const separator = url.includes('?') ? '&' : '?';
    const fullUrl = `${url}${separator}api-key=${this.apiKey}`;

    this.logger.debug({ url: this.redactUrl(fullUrl) }, 'WeatherLink request');

    const response = await fetch(fullUrl, {
      headers: {
        'X-Api-Secret': this.apiSecret,
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.error(
        { status: response.status, url: this.redactUrl(fullUrl), body },
        'WeatherLink request failed',
      );
      throw new WeatherLinkApiError(
        `WeatherLink API returned ${response.status}`,
        response.status,
      );
    }

    const json = await response.json();
    this.logger.debug({ url: this.redactUrl(fullUrl) }, 'WeatherLink response received');

    return schema.parse(json);
  }

  private redactUrl(url: string): string {
    return url.replace(/api-key=[^&]+/, 'api-key=[REDACTED]');
  }
}

export class WeatherLinkApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'WeatherLinkApiError';
  }
}
