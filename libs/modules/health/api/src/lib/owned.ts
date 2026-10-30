import {NotFoundException} from '@nestjs/common';
import {Database} from '@pd/api-core';
import {and, eq} from 'drizzle-orm';
import {AnyPgColumn, PgTable} from 'drizzle-orm/pg-core';

/** A table of the module: every one has `id` and `userId`. */
export type OwnedTable = PgTable & {id: AnyPgColumn; userId: AnyPgColumn};

export function found<T>(row: T | undefined, what: string): T {
  if (!row) {
    throw new NotFoundException(`${what} not found`);
  }
  return row;
}

/** `id`, if given, must be a row of the user's; another user's is as good as none. */
export async function assertOwnedId(
  db: Database,
  userId: string,
  table: OwnedTable,
  id: string | null | undefined,
  what: string,
): Promise<void> {
  if (!id) {
    return;
  }
  const [row] = await db
    .select({id: table.id})
    .from(table)
    .where(and(eq(table.id, id), eq(table.userId, userId)));
  found(row, what);
}

/** Deletes a row of the user's (into the trash); a missing one is a 404. */
export async function removeOwned(
  db: Database,
  userId: string,
  table: OwnedTable,
  id: string,
  what: string,
): Promise<void> {
  const deleted = await db
    .delete(table)
    .where(and(eq(table.id, id), eq(table.userId, userId)))
    .returning({id: table.id});
  found(deleted[0], what);
}
