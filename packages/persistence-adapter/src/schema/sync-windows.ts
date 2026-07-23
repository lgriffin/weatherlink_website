import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { stations } from './stations.js';
import { sensors } from './sensors.js';

export const syncWindows = sqliteTable('sync_windows', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  stationId: text('station_id').notNull().references(() => stations.id),
  sensorId: text('sensor_id').notNull().references(() => sensors.id),
  startTimestamp: integer('start_ts', { mode: 'timestamp' }).notNull(),
  endTimestamp: integer('end_ts', { mode: 'timestamp' }).notNull(),
  syncedAt: integer('synced_at', { mode: 'timestamp' }).notNull(),
  observationCount: integer('observation_count').notNull().default(0),
}, (table) => [
  index('idx_sync_windows_station_sensor').on(table.stationId, table.sensorId),
]);
