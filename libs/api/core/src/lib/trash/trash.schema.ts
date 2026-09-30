import {
  bigserial,
  customType,
  index,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * The trash lives in its own schema, so it is not synced (docs/sync.md): each instance keeps what
 * was deleted on it, for 30 days.
 */
export const trashSchema = pgSchema('trash');

/** PostgreSQL `xid8` — a transaction id; read as a string. */
const xid8 = customType<{ data: string }>({ dataType: () => 'xid8' });

/**
 * Deleted rows, as they were (filled by a trigger, see trash-triggers.ts). The rows of one
 * transaction are one item: an account with its matches comes back with one click.
 */
export const trashRows = trashSchema.table(
  'rows',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    /**
     * Whose row it was; `null` for tables without a user (a repository's star history). No
     * foreign key on purpose: deleting a user must not fail on its own trash.
     */
    userId: uuid(),
    tx: xid8().notNull(),
    tableName: text().notNull(),
    row: jsonb().notNull(),
    deletedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index().on(table.tx), index().on(table.userId, table.deletedAt)],
);
