import { sql } from 'drizzle-orm';
import { Database } from '../database/database.module';

/** A synced table as PostgreSQL describes it. */
export interface SyncTable {
  name: string;
  primaryKey: string[];
  columns: string[];
  /** Unique constraints other than the primary key, as column lists. */
  uniques: string[][];
  /** Tables this one references by foreign keys. */
  references: string[];
  /** Has binary columns (diary photos): its rows are read one at a time, not in bulk. */
  large: boolean;
}

/**
 * Every table in the `public` schema is synced — module tables need nothing extra.
 * The list is read from the database catalog, so new tables are picked up automatically.
 */
export async function readSyncTables(db: Database): Promise<SyncTable[]> {
  const { rows } = await db.execute<{
    name: string;
    columns: string[];
    primary_key: string[] | null;
    uniques: string[][] | null;
    references: string[] | null;
    large: boolean;
  }>(sql`
    SELECT c.relname AS name,
      (SELECT array_agg(a.attname::text ORDER BY a.attnum) FROM pg_attribute a
        WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped) AS columns,
      (SELECT array_agg(a.attname::text ORDER BY k.ord) FROM pg_constraint p
        CROSS JOIN LATERAL unnest(p.conkey) WITH ORDINALITY AS k(attnum, ord)
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
        WHERE p.conrelid = c.oid AND p.contype = 'p') AS primary_key,
      (SELECT json_agg(u.cols) FROM (
        SELECT array_agg(a.attname::text ORDER BY k.ord) AS cols FROM pg_constraint p
          CROSS JOIN LATERAL unnest(p.conkey) WITH ORDINALITY AS k(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
          WHERE p.conrelid = c.oid AND p.contype = 'u' GROUP BY p.oid) u) AS uniques,
      (SELECT array_agg(DISTINCT r.relname::text) FROM pg_constraint f
        JOIN pg_class r ON r.oid = f.confrelid
        WHERE f.conrelid = c.oid AND f.contype = 'f' AND f.confrelid <> c.oid) AS references,
      EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attnum > 0
        AND NOT a.attisdropped AND a.atttypid = 'bytea'::regtype) AS large
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  `);
  const tables = rows
    .filter((row) => row.primary_key?.length)
    .map((row) => ({
      name: row.name,
      primaryKey: row.primary_key ?? [],
      columns: row.columns,
      uniques: row.uniques ?? [],
      references: row.references ?? [],
      large: row.large,
    }));
  return dependencyOrder(tables);
}

/**
 * Referenced tables first (users → projects → transactions), so inserts can go in this order
 * and deletes in the reverse one.
 */
export function dependencyOrder<T extends { name: string; references: string[] }>(
  tables: T[],
): T[] {
  const byName = new Map(tables.map((table) => [table.name, table]));
  const ordered: T[] = [];
  const visited = new Set<string>();
  const visit = (table: T, path: Set<string>) => {
    if (visited.has(table.name) || path.has(table.name)) {
      return; // Already placed, or a reference cycle — the order within a cycle does not matter.
    }
    path.add(table.name);
    for (const name of [...table.references].sort()) {
      const referenced = byName.get(name);
      if (referenced) {
        visit(referenced, path);
      }
    }
    visited.add(table.name);
    ordered.push(table);
  };
  for (const table of [...tables].sort((a, b) => a.name.localeCompare(b.name))) {
    visit(table, new Set());
  }
  return ordered;
}
