import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { stations } from './stations.js';

export const sensors = sqliteTable('sensors', {
  id: text('id').primaryKey(),
  stationId: text('station_id').notNull().references(() => stations.id),
  lsid: integer('lsid').notNull(),
  sensorType: integer('sensor_type').notNull(),
  dataStructureType: integer('data_structure_type'),
  name: text('name').notNull(),
  category: text('category').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
});
