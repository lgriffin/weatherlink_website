import type { FastifyInstance } from 'fastify';
import type { PrometheusMetrics } from '@weather/observability';

export interface MetricsRouteDeps {
  metrics: PrometheusMetrics;
}

export function registerMetricsRoutes(app: FastifyInstance, deps: MetricsRouteDeps): void {
  app.get('/metrics', async (_request, reply) => {
    const text = await deps.metrics.getMetricsText();
    return reply.type(deps.metrics.getContentType()).send(text);
  });
}
