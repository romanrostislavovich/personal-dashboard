import {WowAccountCharacter, WowFoundCharacter} from '@pd/contracts';
import {toWowExternalId} from './wow.service';

/** Characters below this level are listed in the card but not put on the Games page by themselves. */
export const IMPORT_FROM_LEVEL = 10;

/** `region/version/id`: Blizzard's id is unique only inside a region and a version. */
export function wowCharacterKey(
  c: Pick<WowAccountCharacter, 'region' | 'version' | 'id'>,
): string {
  return `${c.region}/${c.version}/${c.id}`;
}

/** The region and version of a key: whether the last look for characters covered it. */
function scopeOf(key: string): string {
  return key.split('/').slice(0, 2).join('/');
}

/** `null` — a character of a version with realms whose realm Blizzard did not tell. */
export function foundExternalId(c: WowAccountCharacter): string | null {
  const name =
    c.slug || [c.name, c.surname].filter(Boolean).join('-').toLowerCase();
  if (c.version === 'forever') {
    return toWowExternalId({
      region: c.region,
      version: c.version,
      realm: '',
      name,
    });
  }
  return c.realmSlug
    ? toWowExternalId({
        region: c.region,
        version: c.version,
        realm: c.realmSlug,
        name,
      })
    : null;
}

/** What import needs of a WoW row of `games_accounts`. */
export interface ImportRow {
  id: string;
  externalId: string;
  blizzardKey: string | null;
  notOnAccountSince: Date | null;
}

export interface ImportPlan {
  /** Rows that are these characters: the key is saved, a renamed one gets its new address. */
  link: {rowId: string; blizzardKey: string; externalId: string}[];
  /** New characters to add. */
  add: {character: WowAccountCharacter; externalId: string}[];
  /** Rows whose character is no longer on the account. */
  gone: string[];
  /** Rows marked gone whose character is back. */
  back: string[];
}

/**
 * Compares the characters found on the account with the Games page:
 * - a character already there — by Blizzard's id (renamed too), or by the address of one added
 *   by hand — is linked to its row, so its history and achievements stay;
 * - a new one from `IMPORT_FROM_LEVEL` is added, unless the owner removed it before;
 * - a row found before whose character is gone is marked, but only for a region and version that
 *   answered (`answered`: `region/version`), so a failed request hides nothing.
 */
export function planImport(
  found: WowAccountCharacter[],
  rows: ImportRow[],
  dismissed: ReadonlySet<string>,
  answered: ReadonlySet<string>,
): ImportPlan {
  const plan: ImportPlan = {link: [], add: [], gone: [], back: []};
  const byKey = new Map(
    rows.filter(r => r.blizzardKey).map(r => [r.blizzardKey, r]),
  );
  const byExternalId = new Map(rows.map(r => [r.externalId, r]));
  const foundKeys = new Set<string>();

  for (const character of found) {
    const key = wowCharacterKey(character);
    const externalId = foundExternalId(character);
    foundKeys.add(key);
    const row =
      byKey.get(key) ?? (externalId ? byExternalId.get(externalId) : undefined);
    if (row) {
      const address = externalId ?? row.externalId;
      if (row.blizzardKey !== key || row.externalId !== address) {
        plan.link.push({rowId: row.id, blizzardKey: key, externalId: address});
      }
      if (row.notOnAccountSince) {
        plan.back.push(row.id);
      }
    } else if (
      externalId &&
      character.level >= IMPORT_FROM_LEVEL &&
      !dismissed.has(key)
    ) {
      plan.add.push({character, externalId});
    }
  }

  for (const row of rows) {
    if (
      row.blizzardKey &&
      !row.notOnAccountSince &&
      !foundKeys.has(row.blizzardKey) &&
      answered.has(scopeOf(row.blizzardKey))
    ) {
      plan.gone.push(row.id);
    }
  }
  return plan;
}

/** What became of each found character, for the Battle.net card. */
export function foundStatuses(
  found: WowAccountCharacter[],
  rows: ImportRow[],
  dismissed: ReadonlySet<string>,
): WowFoundCharacter[] {
  const keys = new Set(rows.map(r => r.blizzardKey));
  const externalIds = new Set(rows.map(r => r.externalId));
  return found.map(character => {
    const key = wowCharacterKey(character);
    const externalId = foundExternalId(character);
    const added =
      keys.has(key) || (externalId !== null && externalIds.has(externalId));
    return {
      ...character,
      key,
      status: added ? 'added' : dismissed.has(key) ? 'removed' : 'hidden',
    };
  });
}
