import {
  pgSchema,
  primaryKey,
  real,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * The index of search by meaning lives in its own schema, so it is not synced (docs/sync.md):
 * it is made from the data, and each instance makes its own with the model it has.
 */
export const searchSchema = pgSchema('search');

/**
 * A vector of each item of the user's history (a diary entry, a task, a visit) — only the
 * vector and where it came from: the text stays in its section, encrypted where the section
 * encrypts it, and is read from there when the item is found.
 */
export const recallVectors = searchSchema.table(
  'vectors',
  {
    userId: uuid().notNull(),
    module: text().notNull(),
    itemId: text().notNull(),
    /** The embedding model: a different one makes the whole index anew. */
    model: text().notNull(),
    /** Of the indexed text: a changed item is indexed again, an unchanged one is not. */
    hash: text().notNull(),
    vector: real().array().notNull(),
    updatedAt: timestamp({withTimezone: true}).notNull().defaultNow(),
  },
  table => [primaryKey({columns: [table.userId, table.module, table.itemId]})],
);
