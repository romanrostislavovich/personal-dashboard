import { users } from '@pd/api-core/schema';
import { doublePrecision, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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
