import { resolve, isAbsolute } from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import * as schema from './schema/index.js';

export type SqliteClient = Client;
export type DrizzleDatabase = ReturnType<typeof drizzle<typeof schema>>;

function repoRoot(): string {
  // Find the monorepo root by walking up from the persistence-adapter package
  const packageDir = new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
  return resolve(packageDir, '../../..');
}

function resolveDbPath(filePath: string): string {
  if (isAbsolute(filePath)) return filePath;
  return resolve(repoRoot(), filePath);
}

export async function createDatabase(filePath: string) {
  const absolutePath = resolveDbPath(filePath);
  const client = createClient({ url: `file:${absolutePath}` });
  await client.execute('PRAGMA journal_mode = WAL');
  await client.execute('PRAGMA busy_timeout = 5000');
  await client.execute('PRAGMA foreign_keys = ON');
  const db = drizzle(client, { schema });
  return { db, client };
}

/**
 * Apply any pending migrations from the repository's `migrations/` folder
 * (the same ones `pnpm db:migrate` applies), so a fresh container starts
 * with an up-to-date schema.
 */
export async function migrateDatabase(db: DrizzleDatabase, folder = resolve(repoRoot(), 'migrations')): Promise<void> {
  await migrate(db, { migrationsFolder: folder });
}
