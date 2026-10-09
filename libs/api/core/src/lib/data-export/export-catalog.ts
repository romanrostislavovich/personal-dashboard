import { sql, SQL } from 'drizzle-orm';
import { Database } from '../database/database.module';
import { dependencyOrder } from '../sync/sync-catalog';

/** A reference of a table to another one by a single column. */
export interface ExportReference {
  column: string;
  table: string;
  /** The column of `table` it points at. */
  target: string;
}

/** A table of `public` as PostgreSQL describes it, with what an export needs to know. */
export interface ExportTable {
  name: string;
  columns: string[];
  primaryKey: string[];
  references: ExportReference[];
  /** Binary columns (photos): they go into the archive as files of their own. */
  binary: string[];
}

/**
 * Never in an archive and never written by an import: the accounts themselves, their secrets
 * (tokens of integrations, the two-factor secret) and what is only a working note of the server.
 */
const NOT_EXPORTED = new Set([
  'users',
  'user_secrets',
  'morning_digest_snapshots',
  // What the security agent found is about this instance, not the user's data.
  'security_findings',
  'security_reports',
  'security_settings',
  // Which troubles of the connections were told about already.
  'integration_alerts',
]);

export const USER_COLUMN = 'user_id';

/** Every table of `public` with a primary key, referenced ones first. */
export async function readExportTables(db: Pick<Database, 'execute'>): Promise<ExportTable[]> {
  const { rows } = await db.execute<{
    name: string;
    columns: string[];
    primary_key: string[] | null;
    refs: ExportReference[] | null;
    binary: string[] | null;
  }>(sql`
    SELECT c.relname AS name,
      (SELECT array_agg(a.attname::text ORDER BY a.attnum) FROM pg_attribute a
        WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped) AS columns,
      (SELECT array_agg(a.attname::text ORDER BY k.ord) FROM pg_constraint p
        CROSS JOIN LATERAL unnest(p.conkey) WITH ORDINALITY AS k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
        WHERE p.conrelid = c.oid AND p.contype = 'p') AS primary_key,
      (SELECT json_agg(json_build_object(
          'column', a.attname, 'table', r.relname, 'target', ra.attname))
        FROM pg_constraint f
        JOIN pg_class r ON r.oid = f.confrelid
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = f.conkey[1]
        JOIN pg_attribute ra ON ra.attrelid = r.oid AND ra.attnum = f.confkey[1]
        WHERE f.conrelid = c.oid AND f.contype = 'f' AND array_length(f.conkey, 1) = 1) AS refs,
      (SELECT array_agg(a.attname::text ORDER BY a.attnum) FROM pg_attribute a
        WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
          AND a.atttypid = 'bytea'::regtype) AS binary
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  `);
  const tables = rows
    .filter((row) => row.primary_key?.length)
    .map((row) => ({
      name: row.name,
      columns: row.columns,
      primaryKey: row.primary_key ?? [],
      references: row.refs ?? [],
      binary: row.binary ?? [],
    }));
  return dependencyOrder(
    tables.map((table) => ({ ...table, references: table.references.map((ref) => ref.table) })),
  ).map(({ name }) => tables.find((table) => table.name === name) as ExportTable);
}

/**
 * Whose a row is. A table with `user_id` says it itself; any other belongs to the user through
 * the row it references (a match belongs to its account, the account to the user).
 * `null` — nothing leads to a user: such a table is not exported.
 */
export type Ownership =
  { kind: 'direct' } | { kind: 'through'; reference: ExportReference; parent: Ownership };

export function ownership(
  table: ExportTable,
  tables: ReadonlyMap<string, ExportTable>,
  path: ReadonlySet<string> = new Set(),
): Ownership | null {
  if (NOT_EXPORTED.has(table.name) || path.has(table.name)) {
    return null;
  }
  if (table.columns.includes(USER_COLUMN)) {
    return { kind: 'direct' };
  }
  for (const reference of table.references) {
    const parent = tables.get(reference.table);
    const owned = parent && ownership(parent, tables, new Set([...path, table.name]));
    if (owned) {
      return { kind: 'through', reference, parent: owned };
    }
  }
  return null;
}

/** The tables an archive holds, with how each one's rows are told to be a user's. */
export function exportable(tables: ExportTable[]): { table: ExportTable; owned: Ownership }[] {
  const byName = new Map(tables.map((table) => [table.name, table]));
  return tables.flatMap((table) => {
    const owned = ownership(table, byName);
    return owned ? [{ table, owned }] : [];
  });
}

/** SQL condition "the row `alias` is the user's". */
export function ownedBy(owned: Ownership, alias: string, userId: string, depth = 0): SQL {
  if (owned.kind === 'direct') {
    return sql`${sql.identifier(alias)}.${sql.identifier(USER_COLUMN)} = ${userId}`;
  }
  const parent = `o${depth}`;
  const { column, table, target } = owned.reference;
  return sql`EXISTS (SELECT 1 FROM ${sql.identifier(table)} ${sql.identifier(parent)}
    WHERE ${sql.identifier(parent)}.${sql.identifier(target)} = ${sql.identifier(alias)}.${sql.identifier(column)}
      AND ${ownedBy(owned.parent, parent, userId, depth + 1)})`;
}
