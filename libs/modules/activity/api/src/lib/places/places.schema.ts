import {
  encryptedText,
  registerEncryptedTables,
  users,
} from '@pd/api-core/schema';
import {
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import {activityDevices} from '../activity.schema';

/**
 * Where the phone was (the Android app takes a low-power fix every 15 minutes once the location
 * is allowed). The point is stored encrypted, like the diary: `"52.2297,21.0122"` — where
 * someone lives and goes is among the most private things the dashboard keeps.
 */
export const activityPhoneLocations = pgTable(
  'activity_phone_locations',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    deviceId: uuid()
      .notNull()
      .references(() => activityDevices.id, {onDelete: 'cascade'}),
    at: timestamp({withTimezone: true}).notNull(),
    point: encryptedText().notNull(),
    /** Meters, as Android estimated it. */
    accuracy: real().notNull(),
  },
  table => [
    // A batch sent twice (the answer was lost) is written once.
    unique().on(table.deviceId, table.at),
    index().on(table.userId, table.at),
  ],
);

/** A place the user named ("Home", "Work"): the stays within its radius take the name. */
export const activityPlaces = pgTable('activity_places', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .references(() => users.id, {onDelete: 'cascade'}),
  name: text().notNull(),
  /** Encrypted like the fixes: `"52.2297,21.0122"`. */
  point: encryptedText().notNull(),
  radiusM: integer().notNull(),
  createdAt: timestamp({withTimezone: true}).notNull().defaultNow(),
});

/**
 * What a map service called the place of a stay (the café, the gym, else the address): looked up
 * once and kept, so a place met again is named without asking. The point and the name are
 * encrypted — an address is as private as the fixes.
 */
export const activityPlaceNames = pgTable(
  'activity_place_names',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    point: encryptedText().notNull(),
    name: encryptedText().notNull(),
    /** `cafe`, `supermarket`, `gym`…; `null` — an address. */
    kind: text(),
    /** `osm` or `google`. */
    source: text().notNull(),
    createdAt: timestamp({withTimezone: true}).notNull().defaultNow(),
  },
  table => [index().on(table.userId)],
);

/**
 * Where the user is now, as the automations last told it: a named place, or away from all of
 * them. Kept so that "came to the gym" fires once, not on every batch of fixes or after a restart.
 */
export const activityPlacePresence = pgTable('activity_place_presence', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .unique()
    .references(() => users.id, {onDelete: 'cascade'}),
  /** `null` — at none of the named places. */
  placeId: uuid().references(() => activityPlaces.id, {onDelete: 'set null'}),
  changedAt: timestamp({withTimezone: true}).notNull().defaultNow(),
});

/**
 * "Where were you?" asked about a stay with no name (places-question.service.ts), once a stay:
 * the place's middle and the names offered (JSON), both encrypted like the fixes.
 */
export const activityPlaceQuestions = pgTable(
  'activity_place_questions',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, {onDelete: 'cascade'}),
    point: encryptedText().notNull(),
    stayStart: timestamp({withTimezone: true}).notNull(),
    stayEnd: timestamp({withTimezone: true}).notNull(),
    /** `FoundPlace[]` as JSON: the buttons, in their order. */
    offered: encryptedText().notNull(),
    answeredAt: timestamp({withTimezone: true}),
    createdAt: timestamp({withTimezone: true}).notNull().defaultNow(),
  },
  table => [index().on(table.userId, table.stayStart)],
);

registerEncryptedTables(
  activityPhoneLocations,
  activityPlaces,
  activityPlaceNames,
  activityPlaceQuestions,
);
