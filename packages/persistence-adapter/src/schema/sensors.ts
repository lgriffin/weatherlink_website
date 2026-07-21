import { pgTable, text, integer, boolean } from 'drizzle-orm/pg-core';
import { stations } from './stations.js';

export const sensors = pgTable('sensors', {
  id: text('id').primaryKey(),
  stationId: text('station_id').notNull().references(() => stations.id),
  lsid: integer('lsid').notNull(),
  sensorType: integer('sensor_type').notNull(),
  dataStructureType: integer('data_structure_type'),
  name: text('name').notNull(),
  category: text('category').notNull(),
  isActive: boolean('is_active').notNull().default(true),
});
