import { EnvSchema } from '@weather/contracts';
import { buildApp } from './app.js';

const env = EnvSchema.parse(process.env);
const { app, client, logger } = await buildApp(env);

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Shutting down gracefully');
  await app.close();
  client.close();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

await app.listen({ port: env.PORT, host: '0.0.0.0' });
logger.info({ port: env.PORT }, 'API server started');
