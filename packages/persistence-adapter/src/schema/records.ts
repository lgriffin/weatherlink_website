import { sqliteTable, text, real, integer, index } from 'drizzle-orm/sqlite-core';
import { stations } from './stations.js';

export const records = sqliteTable('records', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  stationId: text('station_id').notNull().references(() => stations.id),
  measurementName: text('measurement_name').notNull(),
  unit: text('unit').notNull(),
  scope: text('scope').notNull(),
  scopeKey: text('scope_key').notNull(),
  recordType: text('record_type').notNull(),
  value: real('value').notNull(),
  date: text('date').notNull(),
  description: text('description'),
}, (table) => [
  index('idx_records_station_scope').on(table.stationId, table.scope),
  index('idx_records_station_measurement').on(table.stationId, table.measurementName),
]);
