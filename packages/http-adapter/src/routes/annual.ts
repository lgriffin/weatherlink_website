import type { FastifyInstance } from 'fastify';
import type { GetAnnualStats } from '@weather/application';

export interface AnnualRouteDeps {
  getAnnualStats: GetAnnualStats;
}

export function registerAnnualRoutes(app: FastifyInstance, deps: AnnualRouteDeps): void {
  app.get('/api/v1/annual', async (request, reply) => {
    const { years = '3' } = request.query as { years?: string };
    const count = Number(years);
    if (!Number.isInteger(count) || count < 1 || count > 10) {
      return reply.code(400).send({
        error: { code: 'INVALID_YEARS', message: 'Query parameter "years" must be 1 to 10.' },
      });
    }
    return reply.send(await deps.getAnnualStats.execute(count));
  });
}
