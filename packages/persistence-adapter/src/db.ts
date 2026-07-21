import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema/index.js';

const { Pool } = pg;

export type Database = ReturnType<typeof drizzle<typeof schema>>;

export function createDatabase(connectionString: string) {
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });
  return { db, pool };
}
