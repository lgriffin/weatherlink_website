import type { FastifyInstance } from 'fastify';
import type { GetForecast } from '@weather/application';
import { ForecastPayloadSchema, type ForecastResponse } from '@weather/contracts';

export interface ForecastRouteDeps {
  getForecast: GetForecast;
}

export function registerForecastRoutes(app: FastifyInstance, deps: ForecastRouteDeps): void {
  app.get('/api/v1/forecast', async (request, reply) => {
    const { forecast, warnings } = await deps.getForecast.execute();
    // Uploads were checked on the way in; anything older that no longer fits is left out, not sent broken.
    const payload = forecast ? ForecastPayloadSchema.safeParse(forecast.payload) : null;
    if (forecast && payload && !payload.success) {
      request.log.warn({ source: forecast.source, receivedAt: forecast.receivedAt.toISOString(), issues: payload.error.issues },
        'Latest forecast no longer fits the contract; not shown');
    }
    const body: ForecastResponse = {
      forecast: forecast && payload?.success
        ? { source: forecast.source, receivedAt: forecast.receivedAt.toISOString(), stale: forecast.stale, payload: payload.data }
        : null,
      warnings: warnings?.map((w) => ({
        level: w.level, type: w.type, headline: w.headline, description: w.description,
        onset: w.onset?.toISOString() ?? null, expiry: w.expiry?.toISOString() ?? null, regions: [...w.regions],
      })) ?? null,
    };
    return reply.send(body);
  });
}
