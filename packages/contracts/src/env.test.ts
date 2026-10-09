import { describe, it, expect } from 'vitest';
import { EnvSchema } from './env.js';

describe('EnvSchema', () => {
  const validEnv = {
    WEATHERLINK_API_KEY: 'test-key',
    WEATHERLINK_API_SECRET: 'test-secret',
    DATABASE_PATH: './data/weather.db',
  };

  it('accepts valid minimal configuration', () => {
    const result = EnvSchema.safeParse(validEnv);
    expect(result.success).toBe(true);
  });

  it('applies default values', () => {
    const result = EnvSchema.parse(validEnv);
    expect(result.PORT).toBe(1456);
    expect(result.LOG_LEVEL).toBe('info');
    expect(result.NODE_ENV).toBe('development');
    expect(result.APP_TIMEZONE).toBe('Europe/Dublin');
    expect(result.CURRENT_POLL_INTERVAL_MS).toBe(60000);
    expect(result.CURRENT_DELAYED_AFTER_SECONDS).toBe(300);
    expect(result.CURRENT_STALE_AFTER_SECONDS).toBe(900);
    expect(result.METRICS_ENABLED).toBe(true);
  });

  it('shows an approximate station location unless told otherwise', () => {
    expect(EnvSchema.parse(validEnv).PUBLIC_LOCATION).toBe('approximate');
    expect(EnvSchema.parse({ ...validEnv, PUBLIC_LOCATION: '' }).PUBLIC_LOCATION).toBe('approximate');
    expect(EnvSchema.parse({ ...validEnv, PUBLIC_LOCATION: 'exact' }).PUBLIC_LOCATION).toBe('exact');
    expect(EnvSchema.safeParse({ ...validEnv, PUBLIC_LOCATION: 'street' }).success).toBe(false);
  });

  it('rejects missing API key', () => {
    const result = EnvSchema.safeParse({
      ...validEnv,
      WEATHERLINK_API_KEY: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing API secret', () => {
    const result = EnvSchema.safeParse({
      ...validEnv,
      WEATHERLINK_API_SECRET: undefined,
    });
    expect(result.success).toBe(false);
  });

  it('applies default DATABASE_PATH', () => {
    const result = EnvSchema.parse({
      WEATHERLINK_API_KEY: 'key',
      WEATHERLINK_API_SECRET: 'secret',
    });
    expect(result.DATABASE_PATH).toBe('./data/weather.db');
  });

  it('coerces PORT from string', () => {
    const result = EnvSchema.parse({ ...validEnv, PORT: '3000' });
    expect(result.PORT).toBe(3000);
  });

  it('rejects invalid PORT', () => {
    const result = EnvSchema.safeParse({ ...validEnv, PORT: '99999' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid LOG_LEVEL', () => {
    const result = EnvSchema.safeParse({ ...validEnv, LOG_LEVEL: 'verbose' });
    expect(result.success).toBe(false);
  });

  it('accepts valid overrides', () => {
    const result = EnvSchema.parse({
      ...validEnv,
      PORT: '8080',
      LOG_LEVEL: 'debug',
      NODE_ENV: 'production',
      CURRENT_POLL_INTERVAL_MS: '30000',
    });
    expect(result.PORT).toBe(8080);
    expect(result.LOG_LEVEL).toBe('debug');
    expect(result.NODE_ENV).toBe('production');
    expect(result.CURRENT_POLL_INTERVAL_MS).toBe(30000);
  });

  it('rejects poll interval below minimum', () => {
    const result = EnvSchema.safeParse({
      ...validEnv,
      CURRENT_POLL_INTERVAL_MS: '1000',
    });
    expect(result.success).toBe(false);
  });
});
