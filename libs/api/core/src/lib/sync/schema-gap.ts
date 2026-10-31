/**
 * How many migrations `own` is ahead of `theirs` (negative: behind), when one list is the start of
 * the other — the two instances can sync across the versions (docs/sync.md, "Across versions").
 * `null`: the lists went apart (different migrations at the same place) and they cannot.
 */
export function schemaGap(own: string[], theirs: string[]): number | null {
  const shared = Math.min(own.length, theirs.length);
  for (let index = 0; index < shared; index++) {
    if (own[index] !== theirs[index]) {
      return null;
    }
  }
  return own.length - theirs.length;
}

/**
 * How an incoming row fits the local table: `newer` — it has columns this side does not know
 * yet (it waits until this side is updated), `partial` — some local columns are missing (an older
 * side sent it: they keep their values here), `whole` — the same columns.
 */
export function rowFit(
  row: string,
  columns: readonly string[],
): 'newer' | 'partial' | 'whole' {
  const keys = Object.keys(JSON.parse(row) as Record<string, unknown>);
  const known = new Set(columns);
  if (keys.some(key => !known.has(key))) {
    return 'newer';
  }
  return keys.length < columns.length ? 'partial' : 'whole';
}
