import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const stations = sqliteTable('stations', {
  id: text('id').primaryKey(),
  weatherLinkStationId: text('weatherlink_station_id').notNull(),
  name: text('name').notNull(),
  timezone: text('timezone').notNull().default('UTC'),
  latitude: real('latitude'),
  longitude: real('longitude'),
  elevationMetres: real('elevation_metres'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  registeredAt: integer('registered_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});
