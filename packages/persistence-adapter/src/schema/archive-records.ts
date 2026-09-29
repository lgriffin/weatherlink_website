import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core';
import { stations } from './stations.js';

export const archiveRecords = sqliteTable('archive_records', {
  stationId: text('station_id').notNull().references(() => stations.id),
  sensorId: text('sensor_id').notNull(),
  sensorType: integer('sensor_type').notNull(),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
  intervalMinutes: integer('interval_minutes'),
  payload: text('payload', { mode: 'json' }).notNull(),
  fetchedAt: integer('fetched_at', { mode: 'timestamp' }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.stationId, table.sensorId, table.timestamp] }),
  index('idx_archive_records_station_timestamp').on(table.stationId, table.timestamp),
]);
