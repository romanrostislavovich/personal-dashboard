import { users } from '@pd/api-core/schema';
import {
  boolean,
  date,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * The user's SoundCloud profile as an author. The sign-in token (optional, for private tracks)
 * is stored separately in SecretsService (`music.soundcloud.token`).
 */
export const soundcloudAccounts = pgTable('music_soundcloud_accounts', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** SoundCloud's own id of the user. */
  soundcloudId: text().notNull(),
  /** The name from the profile's address. */
  username: text().notNull(),
  displayName: text(),
  avatarUrl: text(),
  permalinkUrl: text().notNull(),
  followers: integer().notNull().default(0),
  lastSyncedAt: timestamp({ withTimezone: true }),
  lastError: text(),
});

/** The user's tracks with their current counters (updated by the sync). */
export const soundcloudTracks = pgTable(
  'music_soundcloud_tracks',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** SoundCloud's own id: a renamed track stays the same row and keeps its history. */
    soundcloudId: text().notNull(),
    title: text().notNull(),
    permalinkUrl: text().notNull(),
    artworkUrl: text(),
    isPrivate: boolean().notNull().default(false),
    publishedAt: timestamp({ withTimezone: true }).notNull(),
    durationMs: integer().notNull().default(0),
    genre: text(),
    plays: integer().notNull().default(0),
    likes: integer().notNull().default(0),
    reposts: integer().notNull().default(0),
    comments: integer().notNull().default(0),
    downloads: integer().notNull().default(0),
    /** Tell about new comments and play milestones; on unless the user switches it off. */
    notify: boolean().notNull().default(true),
  },
  (table) => [unique().on(table.userId, table.soundcloudId)],
);

/** Daily history of a track: one row per day (the last value of the day). */
export const soundcloudTrackDays = pgTable(
  'music_soundcloud_track_days',
  {
    trackId: uuid()
      .notNull()
      .references(() => soundcloudTracks.id, { onDelete: 'cascade' }),
    day: date({ mode: 'string' }).notNull(),
    plays: integer().notNull(),
    likes: integer().notNull(),
    reposts: integer().notNull(),
    comments: integer().notNull(),
  },
  (table) => [primaryKey({ columns: [table.trackId, table.day] })],
);

/** Daily history of the profile: followers at the end of the day. */
export const soundcloudAccountDays = pgTable(
  'music_soundcloud_account_days',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    day: date({ mode: 'string' }).notNull(),
    followers: integer().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.day] })],
);

export type SoundcloudAccountRow = typeof soundcloudAccounts.$inferSelect;
export type SoundcloudTrackRow = typeof soundcloudTracks.$inferSelect;
