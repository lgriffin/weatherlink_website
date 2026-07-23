import { z } from 'zod';
import type { Logger } from '@weather/observability';
import { WeatherLinkStationsResponseSchema, type WeatherLinkStationsResponse } from './schemas/stations.js';
import { WeatherLinkCurrentResponseSchema, type WeatherLinkCurrentResponse } from './schemas/current.js';
import { WeatherLinkSensorsResponseSchema, type WeatherLinkSensorsResponse } from './schemas/sensors.js';
import { WeatherLinkHistoricResponseSchema, type WeatherLinkHistoricResponse } from './schemas/historic.js';

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

  async getHistoric(
    stationId: number,
    startTimestamp: number,
    endTimestamp: number,
  ): Promise<WeatherLinkHistoricResponse> {
    const url = `${this.baseUrl}/historic/${stationId}?start-timestamp=${startTimestamp}&end-timestamp=${endTimestamp}`;
    return this.request(url, WeatherLinkHistoricResponseSchema);
  }

  private async request<T>(url: string, schema: z.ZodSchema<T>): Promise<T> {
    const separator = url.includes('?') ? '&' : '?';
    const fullUrl = `${url}${separator}api-key=${this.apiKey}`;
    const maxRetries = 3;
    const baseDelayMs = 1000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      this.logger.debug({ url: this.redactUrl(fullUrl), attempt }, 'WeatherLink request');

      let response: Response;
      try {
        response = await fetch(fullUrl, {
          headers: { 'X-Api-Secret': this.apiSecret },
          signal: AbortSignal.timeout(30_000),
        });
      } catch (error) {
        if (attempt < maxRetries) {
          const delay = baseDelayMs * Math.pow(2, attempt);
          this.logger.warn({ err: error, attempt, delay }, 'Network error, retrying');
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw error;
      }

      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('Retry-After') || '5');
        const delay = retryAfter * 1000;
        this.logger.warn({ retryAfter, attempt }, 'Rate limited, waiting');
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      if (response.status >= 500 && attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        this.logger.warn({ status: response.status, attempt, delay }, 'Server error, retrying');
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

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

    throw new WeatherLinkApiError('Max retries exceeded', 0);
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
