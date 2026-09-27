import { users } from '@pd/api-core/schema';
import { index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

/**
 * Локальная копия прослушиваний из Last.fm. Хранится, чтобы быстро считать
 * статистику по дням (и в будущем — ачивки), не дёргая Last.fm на каждый запрос.
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
    // Повторная синхронизация не создаёт дублей.
    unique().on(table.userId, table.playedAt, table.track),
    index().on(table.userId, table.playedAt),
  ],
);

/** Настройки Last.fm. API-ключ хранится отдельно в SecretsService (`music.lastfm.api-key`). */
export const musicSettings = pgTable('music_settings', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  lastfmUsername: text(),
  lastSyncedAt: timestamp({ withTimezone: true }),
  lastError: text(),
});

export type MusicSettingsRow = typeof musicSettings.$inferSelect;
