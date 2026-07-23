import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { stations } from './stations.js';
import { sensors } from './sensors.js';

export const observations = sqliteTable('observations', {
  id: text('id').primaryKey(),
  stationId: text('station_id').notNull().references(() => stations.id),
  sensorId: text('sensor_id').notNull().references(() => sensors.id),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
  receivedAt: integer('received_at', { mode: 'timestamp' }).notNull(),
  source: text('source').notNull(),
  measurements: text('measurements', { mode: 'json' }).notNull(),
  rawPayloadHash: text('raw_payload_hash').notNull(),
}, (table) => [
  index('idx_observations_station_timestamp').on(table.stationId, table.timestamp),
  index('idx_observations_timestamp').on(table.timestamp),
]);
