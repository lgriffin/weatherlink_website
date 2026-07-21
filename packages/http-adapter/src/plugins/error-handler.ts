import type { FastifyInstance, FastifyError } from 'fastify';
import type { Logger } from '@weather/observability';

export function registerErrorHandler(app: FastifyInstance, logger: Logger): void {
  app.setErrorHandler(async (error: FastifyError, _request, reply) => {
    logger.error({ err: error }, 'Unhandled error');

    const statusCode = error.statusCode ?? 500;
    return reply.code(statusCode).send({
      error: {
        code: statusCode >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST',
        message: statusCode >= 500 ? 'An internal error occurred.' : error.message,
      },
    });
  });
}
