import pino from 'pino';

export type Logger = pino.Logger;

export function createLogger(options: {
  level: string;
  name: string;
}): Logger {
  return pino({
    name: options.name,
    level: options.level,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
    redact: {
      paths: [
        'WEATHERLINK_API_SECRET',
        'req.headers.authorization',
        'req.headers["x-api-secret"]',
      ],
      censor: '[REDACTED]',
    },
  });
}
