import type { FastifyInstance } from 'fastify';
import type { GetCurrentDashboard } from '@weather/application';

export interface CurrentRouteDeps {
  getCurrentDashboard: GetCurrentDashboard;
}

export function registerCurrentRoutes(app: FastifyInstance, deps: CurrentRouteDeps): void {
  app.get('/api/v1/current', async (_request, reply) => {
    const result = await deps.getCurrentDashboard.execute();

    if (!result.station) {
      return reply.code(404).send({
        error: {
          code: 'STATION_NOT_CONFIGURED',
          message: 'No active weather station is configured.',
        },
      });
    }

    const measurements: Record<string, unknown> = {};
    if (result.observation) {
      for (const [key, m] of result.observation.measurements) {
        measurements[key] = {
          name: m.name,
          value: m.value,
          unit: m.unit,
          timestamp: m.timestamp.toISOString(),
        };
      }
    }

    return reply.send({
      stationId: String(result.station.id),
      stationName: result.station.name,
      timezone: result.station.timezone,
      timestamp: result.observation?.timestamp.toISOString() ?? null,
      freshness: {
        state: result.freshness.state,
        ageSeconds: result.freshness.ageSeconds,
        lastObservation: result.freshness.lastObservation?.toISOString() ?? null,
      },
      measurements,
    });
  });
}
