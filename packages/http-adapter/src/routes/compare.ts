import type { FastifyInstance } from 'fastify';
import type { GetYearComparison } from '@weather/application';
import { RUNNING_TOTAL_METRICS, type RunningTotalMetric } from '@weather/application';

export interface CompareRouteDeps {
  getYearComparison: GetYearComparison;
}

export function registerCompareRoutes(app: FastifyInstance, deps: CompareRouteDeps): void {
  app.get('/api/v1/compare', async (request, reply) => {
    const { metric = 'rain.daily', month } = request.query as { metric?: string; month?: string };

    if (!(RUNNING_TOTAL_METRICS as readonly string[]).includes(metric)) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_METRIC',
          message: `Query parameter "metric" must be one of: ${RUNNING_TOTAL_METRICS.join(', ')}.`,
        },
      });
    }

    const monthNumber = month === undefined ? new Date().getMonth() + 1 : Number(month);
    if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
      return reply.code(400).send({
        error: { code: 'INVALID_MONTH', message: 'Query parameter "month" must be 1 to 12.' },
      });
    }

    const result = await deps.getYearComparison.execute(metric as RunningTotalMetric, monthNumber);
    return reply.send(result);
  });
}
