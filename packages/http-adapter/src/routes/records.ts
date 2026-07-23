import type { FastifyInstance } from 'fastify';
import type { GetRecords } from '@weather/application';
import type { RecordScope } from '@weather/domain';

export interface RecordsRouteDeps {
  getRecords: GetRecords;
}

export function registerRecordsRoutes(app: FastifyInstance, deps: RecordsRouteDeps): void {
  app.get('/api/v1/records', async (request, reply) => {
    const { scope } = request.query as { scope?: string };

    const validScopes = ['all-time', 'monthly', 'yearly'];
    const resolvedScope = scope && validScopes.includes(scope)
      ? (scope as RecordScope)
      : undefined;

    const records = await deps.getRecords.execute(resolvedScope);

    return reply.send({
      records: records.map((r) => ({
        measurementName: r.measurementName,
        unit: r.unit,
        scope: r.scope,
        scopeKey: r.scopeKey,
        recordType: r.recordType,
        value: r.value,
        date: r.date,
      })),
    });
  });
}
