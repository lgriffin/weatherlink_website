import type { FastifyInstance } from 'fastify';
import type { Logger } from '@weather/observability';

export function registerRequestLogging(app: FastifyInstance, logger: Logger): void {
  app.addHook('onRequest', async (request) => {
    request.log = logger.child({ reqId: request.id });
  });

  app.addHook('onResponse', async (request, reply) => {
    logger.info({
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: reply.elapsedTime,
    }, 'request completed');
  });
}
