import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { GetIngestOverview, RecordIngestReport } from '@weather/application';
import { isIngestKind } from '@weather/domain';
import { INGEST_PAYLOAD_SCHEMAS } from '@weather/contracts';

export interface IngestRouteDeps {
  recordIngestReport: RecordIngestReport;
  getIngestOverview: GetIngestOverview;
  /** Shared secret uploads must send as `Authorization: Bearer <token>`; unset refuses every upload. */
  ingestToken: string | undefined;
}

const MAX_BODY_BYTES = 2 * 1024 * 1024;

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function bearer(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match ? match[1]!.trim() : null;
}

function sourceOf(request: FastifyRequest): string {
  const raw = request.headers['x-source'];
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  return value ? value.slice(0, 64) : 'unknown';
}

export function registerIngestRoutes(app: FastifyInstance, deps: IngestRouteDeps): void {
  const expected = deps.ingestToken ? digest(deps.ingestToken) : null;

  app.get('/api/v1/ingest', async (_request, reply) => {
    const overview = await deps.getIngestOverview.execute();
    return reply.send({ uploadsEnabled: expected !== null, ...overview });
  });

  app.post('/api/v1/ingest/:kind', { bodyLimit: MAX_BODY_BYTES }, async (request, reply) => {
    if (!expected) {
      return reply.code(503).send({
        error: { code: 'INGEST_DISABLED', message: 'Uploads are turned off: set INGEST_TOKEN on the server.' },
      });
    }
    const token = bearer(request);
    // Compare digests so the check takes the same time whatever the token's length.
    if (!token || !timingSafeEqual(digest(token), expected)) {
      return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Missing or wrong upload token.' } });
    }

    const { kind } = request.params as { kind: string };
    if (!isIngestKind(kind)) {
      return reply.code(404).send({
        error: { code: 'UNKNOWN_KIND', message: `Unknown output "${kind}". Use forecast, model-scores, outages or harvest.` },
      });
    }

    const parsed = INGEST_PAYLOAD_SCHEMAS[kind].safeParse(request.body);
    if (!parsed.success) {
      const issues = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || '(body)'}: ${i.message}`);
      return reply.code(400).send({
        error: { code: 'INVALID_PAYLOAD', message: `This doesn't look like a ${kind} output. ${issues.join('; ')}` },
      });
    }

    const saved = await deps.recordIngestReport.execute(kind, sourceOf(request), parsed.data);
    return reply.code(201).send({ id: saved.id, kind: saved.kind, source: saved.source, receivedAt: saved.receivedAt });
  });
}
