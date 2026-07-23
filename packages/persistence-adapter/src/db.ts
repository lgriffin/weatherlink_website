import { resolve, isAbsolute } from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema/index.js';

export type SqliteClient = Client;
export type DrizzleDatabase = ReturnType<typeof drizzle<typeof schema>>;

function resolveDbPath(filePath: string): string {
  if (isAbsolute(filePath)) return filePath;
  // Find the monorepo root by walking up from the persistence-adapter package
  const packageDir = new URL('.', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
  const repoRoot = resolve(packageDir, '../../..');
  return resolve(repoRoot, filePath);
}

export async function createDatabase(filePath: string) {
  const absolutePath = resolveDbPath(filePath);
  const client = createClient({ url: `file:${absolutePath}` });
  await client.execute('PRAGMA journal_mode = WAL');
  await client.execute('PRAGMA foreign_keys = ON');
  const db = drizzle(client, { schema });
  return { db, client };
}
