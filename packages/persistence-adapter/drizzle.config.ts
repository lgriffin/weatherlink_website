import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'drizzle-kit';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const dbPath = process.env['DATABASE_PATH'] ?? './data/weather.db';
const absolutePath = resolve(repoRoot, dbPath);

export default defineConfig({
  out: '../../migrations',
  schema: './src/schema/index.ts',
  dialect: 'sqlite',
  dbCredentials: {
    url: `file:${absolutePath}`,
  },
});
