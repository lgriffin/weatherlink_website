import type { FastifyInstance } from 'fastify';
import type { GetHistory } from '@weather/application';

export interface HistoryRouteDeps {
  getHistory: GetHistory;
}

export function registerHistoryRoutes(app: FastifyInstance, deps: HistoryRouteDeps): void {
  app.get('/api/v1/history', async (request, reply) => {
    const { date } = request.query as { date?: string };

    if (!date || !/^\d{2}-\d{2}$/.test(date)) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_DATE',
          message: 'Query parameter "date" must be in MM-DD format.',
        },
      });
    }

    const result = await deps.getHistory.execute(date);

    const measurements: Record<string, Record<string, unknown>> = {};
    for (const [name, byYear] of result.measurements) {
      const yearData: Record<string, unknown> = {};
      for (const [year, summary] of byYear) {
        yearData[year] = {
          date: summary.date,
          min: summary.min,
          max: summary.max,
          avg: summary.avg,
          count: summary.count,
        };
      }
      measurements[name] = yearData;
    }

    return reply.send({
      monthDay: result.monthDay,
      measurements,
    });
  });
}
