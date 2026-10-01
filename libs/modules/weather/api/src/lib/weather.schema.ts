import { users } from '@pd/api-core/schema';
import { ThermalFeel } from '@pd/contracts';
import { doublePrecision, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Where the user is: the forecast and the morning digest are for this place. */
export const weatherLocations = pgTable('weather_locations', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  region: text(),
  country: text(),
  latitude: doublePrecision().notNull(),
  longitude: doublePrecision().notNull(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** How the forecast is told to this user. Kept apart from the location, which can be cleared. */
export const weatherSettings = pgTable('weather_settings', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** How the user takes the cold: shifts the clothing advice (see THERMAL_FEELS). */
  thermalFeel: integer().$type<ThermalFeel>().notNull().default(0),
});
