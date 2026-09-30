import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const ingestReports = sqliteTable('ingest_reports', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kind: text('kind').notNull(),
  source: text('source').notNull(),
  receivedAt: integer('received_at', { mode: 'timestamp_ms' }).notNull(),
  payload: text('payload', { mode: 'json' }).notNull(),
}, (table) => [
  index('idx_ingest_reports_kind_received').on(table.kind, table.receivedAt),
]);
