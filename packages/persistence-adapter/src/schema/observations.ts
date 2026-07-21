import { pgTable, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { stations } from './stations.js';
import { sensors } from './sensors.js';

export const observations = pgTable('observations', {
  id: text('id').primaryKey(),
  stationId: text('station_id').notNull().references(() => stations.id),
  sensorId: text('sensor_id').notNull().references(() => sensors.id),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
  source: text('source').notNull(),
  measurements: jsonb('measurements').notNull(),
  rawPayloadHash: text('raw_payload_hash').notNull(),
}, (table) => [
  index('idx_observations_station_timestamp').on(table.stationId, table.timestamp),
  index('idx_observations_timestamp').on(table.timestamp),
]);
