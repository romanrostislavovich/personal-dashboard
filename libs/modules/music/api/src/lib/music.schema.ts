import { users } from '@pd/api-core/schema';
import { index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

/**
 * Local copy of Last.fm plays. Stored to quickly compute
 * daily statistics (and, in the future, achievements) without hitting Last.fm on every request.
 */
export const scrobbles = pgTable(
  'music_scrobbles',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    playedAt: timestamp({ withTimezone: true }).notNull(),
    artist: text().notNull(),
    track: text().notNull(),
    album: text(),
  },
  (table) => [
    // A repeated sync does not create duplicates.
    unique().on(table.userId, table.playedAt, table.track),
    index().on(table.userId, table.playedAt),
  ],
);

/** Last.fm settings. The API key is stored separately in SecretsService (`music.lastfm.api-key`). */
export const musicSettings = pgTable('music_settings', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  lastfmUsername: text(),
  lastSyncedAt: timestamp({ withTimezone: true }),
  lastError: text(),
});

export type MusicSettingsRow = typeof musicSettings.$inferSelect;
