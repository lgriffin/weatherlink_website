import { pgTable, text, boolean, real, timestamp } from 'drizzle-orm/pg-core';

export const stations = pgTable('stations', {
  id: text('id').primaryKey(),
  weatherLinkStationId: text('weatherlink_station_id').notNull(),
  name: text('name').notNull(),
  timezone: text('timezone').notNull().default('UTC'),
  latitude: real('latitude'),
  longitude: real('longitude'),
  elevationMetres: real('elevation_metres'),
  isActive: boolean('is_active').notNull().default(true),
  registeredAt: timestamp('registered_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});
