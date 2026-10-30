/*
 * Undoing a change of the assistant without code of its own in every tool: a tool names the
 * tables it changes (`AiTool.undoTables`); the user's rows of them are read before and after
 * the call, and the difference is the way back — a row that appeared goes, a changed row gets
 * its old values. Deleted rows are already in the trash (with whatever went with them), so
 * they come back from there. See AiUndoService.
 */

/** A row as PostgreSQL gives it (`to_jsonb`): column names as in the database. */
export type DbRow = Record<string, unknown> & {id: string};

export interface TableChange {
  table: string;
  /** Rows the call added, as they were right after it. */
  inserted: DbRow[];
  /** Rows the call changed: before and right after it. */
  updated: {before: DbRow; after: DbRow}[];
}

/** What it takes to undo one call; stored with the action (AiActionsService). */
export interface UndoData {
  tables: TableChange[];
  /** Trash items (transaction ids) the call left: what it deleted. */
  trash: string[];
}

/** The difference of a table's rows before and after a call; deletions are the trash's. */
export function rowChanges(
  table: string,
  before: DbRow[],
  after: DbRow[],
): TableChange | null {
  const old = new Map(before.map(row => [row.id, row]));
  const inserted: DbRow[] = [];
  const updated: {before: DbRow; after: DbRow}[] = [];
  for (const row of after) {
    const was = old.get(row.id);
    if (!was) {
      inserted.push(row);
    } else if (stable(was) !== stable(row)) {
      updated.push({before: was, after: row});
    }
  }
  return inserted.length || updated.length ? {table, inserted, updated} : null;
}

/** Whether a call changed anything that can be undone. */
export function isEmpty(undo: UndoData): boolean {
  return undo.tables.length === 0 && undo.trash.length === 0;
}

/** JSON with sorted keys: the same row read twice compares equal. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item as Record<string, unknown>).sort(([a], [b]) =>
            a.localeCompare(b),
          ),
        )
      : item,
  );
}
