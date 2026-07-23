import type { FastifyInstance } from 'fastify';
import type { ExportData } from '@weather/application';
import type { ExportFormat } from '@weather/exports';
import type { MeasurementName } from '@weather/domain';

export interface ExportsRouteDeps {
  exportData: ExportData;
}

export function registerExportsRoutes(app: FastifyInstance, deps: ExportsRouteDeps): void {
  app.get('/api/v1/export', async (request, reply) => {
    const { format, metrics, from, to } = request.query as {
      format?: string;
      metrics?: string;
      from?: string;
      to?: string;
    };

    if (!format || !metrics || !from || !to) {
      return reply.code(400).send({
        error: {
          code: 'MISSING_PARAMS',
          message: 'Query parameters "format", "metrics", "from", and "to" are required.',
        },
      });
    }

    const validFormats = ['csv', 'json', 'svg'];
    if (!validFormats.includes(format)) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_FORMAT',
          message: `Format must be one of: ${validFormats.join(', ')}`,
        },
      });
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return reply.code(400).send({
        error: { code: 'INVALID_DATE', message: '"from" and "to" must be valid ISO date strings.' },
      });
    }

    const metricList = metrics.split(',') as MeasurementName[];

    const result = await deps.exportData.execute(
      format as ExportFormat, metricList, fromDate, toDate,
    );

    return reply
      .header('Content-Type', result.contentType)
      .header('Content-Disposition', `attachment; filename="${result.filename}"`)
      .send(result.content);
  });
}
