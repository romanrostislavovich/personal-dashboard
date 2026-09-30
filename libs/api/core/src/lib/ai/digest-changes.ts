import { DigestSection } from './digest-section';

export interface CollectedSection {
  section: DigestSection;
  facts: unknown;
}

/** A section that goes into today's digest. */
export interface DigestChange {
  section: DigestSection;
  facts: unknown;
  /** The facts of the previous digest, so the model can say "+3 stars"; `null` — first time. */
  previous: unknown;
}

/**
 * What goes into today's digest: sections that always go, and the ones whose facts differ
 * from the last sent ones. Empty sections (`null`) are skipped.
 */
export function digestChanges(
  collected: CollectedSection[],
  lastSent: ReadonlyMap<string, unknown>,
): DigestChange[] {
  return collected
    .filter(({ facts }) => facts !== null && facts !== undefined)
    .map(({ section, facts }) => ({ section, facts, previous: lastSent.get(section.id) ?? null }))
    .filter(
      ({ section, facts, previous }) =>
        section.always || canonicalJson(facts) !== canonicalJson(previous),
    );
}

/**
 * JSON with object keys sorted: PostgreSQL `jsonb` does not keep the key order,
 * so the same facts read back from the database must compare equal.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
}
