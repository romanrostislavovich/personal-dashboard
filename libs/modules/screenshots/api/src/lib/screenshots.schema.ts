import { encryptedBytes, registerEncryptedTables, users } from '@pd/api-core/schema';
import { index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

/**
 * Screenshots of the desktop app, the same as in the folder of every computer: the file is kept
 * byte for byte (a folder compares by its hash), encrypted, with a small picture for the lists.
 */
export const screenshots = pgTable(
  'screenshots',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Its path in the folder: `2026-10/2026-10-16 18-42-07.png`. */
    name: text().notNull(),
    mimeType: text().notNull(),
    size: integer().notNull(),
    width: integer(),
    height: integer(),
    /** SHA-256 of `data`, hex. */
    hash: text().notNull(),
    data: encryptedBytes().notNull(),
    thumbnail: encryptedBytes(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.userId, table.name), index().on(table.userId, table.createdAt)],
);

registerEncryptedTables(screenshots);

export type ScreenshotRow = typeof screenshots.$inferSelect;
