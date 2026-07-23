import type { FastifyInstance } from 'fastify';
import type { GetTimeSeries } from '@weather/application';
import type { MeasurementName } from '@weather/domain';
import type { Resolution } from '@weather/analytics';

export interface SeriesRouteDeps {
  getTimeSeries: GetTimeSeries;
}

export function registerSeriesRoutes(app: FastifyInstance, deps: SeriesRouteDeps): void {
  app.get('/api/v1/series', async (request, reply) => {
    const { metrics, from, to, resolution } = request.query as {
      metrics?: string;
      from?: string;
      to?: string;
      resolution?: string;
    };

    if (!metrics || !from || !to) {
      return reply.code(400).send({
        error: {
          code: 'MISSING_PARAMS',
          message: 'Query parameters "metrics", "from", and "to" are required.',
        },
      });
    }

    const metricList = metrics.split(',') as MeasurementName[];
    const fromDate = new Date(from);
    const toDate = new Date(to);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_DATE',
          message: '"from" and "to" must be valid ISO date strings.',
        },
      });
    }

    const validResolutions = ['raw', 'hourly', 'daily'];
    const resolvedResolution: Resolution =
      resolution && validResolutions.includes(resolution)
        ? (resolution as Resolution)
        : 'hourly';

    const series = await deps.getTimeSeries.execute(
      metricList, fromDate, toDate, resolvedResolution,
    );

    return reply.send({
      series: series.map((s) => ({
        metric: s.metric,
        unit: s.unit,
        resolution: s.resolution,
        points: s.points,
      })),
    });
  });
}
