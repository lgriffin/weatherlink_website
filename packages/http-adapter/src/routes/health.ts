import type { FastifyInstance } from 'fastify';
import type { HealthChecker } from '@weather/observability';

export interface HealthRouteDeps {
  healthChecker: HealthChecker;
}

export function registerHealthRoutes(app: FastifyInstance, deps: HealthRouteDeps): void {
  app.get('/health/live', async (_request, reply) => {
    return reply.send({ status: 'ok' });
  });

  app.get('/health/ready', async (_request, reply) => {
    const health = await deps.healthChecker.check();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    return reply.code(statusCode).send(health);
  });
}
