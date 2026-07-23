import { sqliteTable, text, real, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { stations } from './stations.js';

export const dailySummaries = sqliteTable('daily_summaries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  stationId: text('station_id').notNull().references(() => stations.id),
  date: text('date').notNull(),
  measurementName: text('measurement_name').notNull(),
  unit: text('unit').notNull(),
  min: real('min'),
  max: real('max'),
  avg: real('avg'),
  count: integer('count').notNull().default(0),
}, (table) => [
  uniqueIndex('idx_daily_summaries_unique').on(table.stationId, table.date, table.measurementName),
  index('idx_daily_summaries_station_date').on(table.stationId, table.date),
]);
