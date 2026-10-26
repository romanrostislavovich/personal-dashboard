import { encryptedText, registerEncryptedTables, users } from '@pd/api-core/schema';
import { MovieKind, MovieViewKind } from '@pd/contracts';
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * A film or a show of the user's: found in TMDB (or, without a key, as the page named it), seen,
 * being watched, or wanted.
 */
export const movieTitles = pgTable(
  'movies_titles',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tmdbId: integer(),
    kind: text().$type<MovieKind>().notNull(),
    title: text().notNull(),
    originalTitle: text(),
    year: integer(),
    /** TMDB's path of the poster (`/abc.jpg`). */
    posterPath: text(),
    genres: text().array().notNull().default([]),
    runtimeMinutes: integer(),
    wantedAt: timestamp({ withTimezone: true }),
    watchedOn: date(),
    rating: integer(),
    note: text(),
    /** The page titles already found as this one: they are not looked up again. */
    matchKeys: text().array().notNull().default([]),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.userId, table.tmdbId)],
);

/**
 * A stretch of watching one video on one page, sent by the browser extension. What the page told
 * (its titles) is encrypted: a site may say more than the user would like kept in the open.
 */
export const movieViews = pgTable(
  'movies_views',
  {
    /** Made by the extension: the view grows while it plays and is sent again. */
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    titleId: uuid().references(() => movieTitles.id, { onDelete: 'set null' }),
    kind: text().$type<MovieViewKind>().notNull(),
    site: text().notNull(),
    /** The title read from the page. */
    name: encryptedText().notNull(),
    /** The page's hints as sent, JSON — to find the title again later. */
    hints: encryptedText().notNull(),
    season: integer(),
    episode: integer(),
    startedAt: timestamp({ withTimezone: true }).notNull(),
    endedAt: timestamp({ withTimezone: true }).notNull(),
    watchedSeconds: integer().notNull(),
    positionSeconds: doublePrecision().notNull(),
    durationSeconds: doublePrecision(),
    /** "Not a film": kept out of the lists and the numbers. */
    dismissed: boolean().notNull().default(false),
    /**
     * When the server looked for its title (`movies.match`, every few minutes); `null` — not yet.
     * The look-up runs on the server only: a sync client has no business calling TMDB.
     */
    resolvedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    index().on(table.userId, table.startedAt),
    index().on(table.titleId),
    index().on(table.resolvedAt),
  ],
);

export const movieSettings = pgTable('movies_settings', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  track: boolean().notNull().default(true),
  ignoredSites: text().array().notNull().default([]),
});

registerEncryptedTables(movieViews);

export type MovieTitleRow = typeof movieTitles.$inferSelect;
export type MovieViewRow = typeof movieViews.$inferSelect;
