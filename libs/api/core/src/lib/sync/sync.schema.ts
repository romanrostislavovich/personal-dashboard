import {
  bigint,
  customType,
  index,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Sync bookkeeping lives in its own PostgreSQL schema: every table in `public` is synced,
 * these are not. See docs/sync.md.
 */
export const syncSchema = pgSchema('sync');

/** PostgreSQL `xid8` — a transaction id; read as a string. */
const xid8 = customType<{ data: string }>({ dataType: () => 'xid8' });

/** Orders changes: a new position for every change of a row. */
export const syncChangeSeq = syncSchema.sequence('change_seq');

/**
 * The latest change of every row of every synced table (filled by a trigger, see
 * sync-triggers.ts). A deleted row keeps its entry — that is how the other side learns about it.
 */
export const syncRowVersions = syncSchema.table(
  'row_versions',
  {
    tableName: text().notNull(),
    /** Primary key columns and values: `{"id": "…"}`. */
    pk: jsonb().notNull(),
    /** When the row last changed; the newer change wins a conflict. */
    changedAt: timestamp({ withTimezone: true }).notNull(),
    /** Transaction of the change: the change log is read only up to committed transactions. */
    tx: xid8().notNull(),
    seq: bigint({ mode: 'number' }).notNull(),
    /** `null` — changed here; otherwise the instance the change came from. */
    origin: text(),
  },
  (table) => [
    primaryKey({ columns: [table.tableName, table.pk] }),
    index().on(table.tx, table.seq),
  ],
);

/** Key-value state: cursors of the client, id of this database. */
export const syncState = syncSchema.table('state', {
  key: text().primaryKey(),
  value: text().notNull(),
});

/**
 * Incoming changes that could not be applied yet, usually because they reference a row that
 * has not arrived (a transaction of a new project). Retried after every sync.
 */
export const syncParked = syncSchema.table(
  'parked',
  {
    tableName: text().notNull(),
    pk: jsonb().notNull(),
    changedAt: timestamp({ withTimezone: true }).notNull(),
    row: jsonb(),
    origin: text().notNull(),
    error: text().notNull(),
    parkedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.tableName, table.pk] })],
);

/** Versions that lost a conflict to a newer change — kept so nothing is silently lost. */
export const syncConflicts = syncSchema.table('conflicts', {
  id: uuid().primaryKey().defaultRandom(),
  tableName: text().notNull(),
  pk: jsonb().notNull(),
  /** The losing version of the row. */
  row: jsonb().notNull(),
  reason: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
