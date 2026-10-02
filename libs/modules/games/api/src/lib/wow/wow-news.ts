import { WowDetails } from '@pd/contracts';

/** Something worth a message that happened to a character between two syncs. */
export type WowNews =
  | { kind: 'mythic'; from: number; to: number }
  | { kind: 'raid'; raid: string; difficulty: string; killed: number; total: number }
  | { kind: 'pvp'; bracket: string; from: number; to: number }
  | {
      kind: 'collection';
      what: 'mounts' | 'pets' | 'toys' | 'titles';
      added: number;
      total: number;
    };

const COLLECTIONS = ['mounts', 'pets', 'toys', 'titles'] as const;

/**
 * What changed for the better: a higher Mythic+ rating, a boss killed for the first time, a
 * higher PvP rating, something new in a collection. A number that went down, or one that was
 * not known before, is not news.
 */
export function wowNews(previous: WowDetails, current: WowDetails): WowNews[] {
  const news: WowNews[] = [];

  if (previous.mythic && current.mythic && current.mythic.rating > previous.mythic.rating) {
    news.push({ kind: 'mythic', from: previous.mythic.rating, to: current.mythic.rating });
  }

  const killedBefore = new Map(
    previous.raids.flatMap((raid) =>
      raid.modes.map((mode) => [`${raid.name}|${mode.difficulty}`, mode.killed] as const),
    ),
  );
  for (const raid of current.raids) {
    for (const mode of raid.modes) {
      const before = killedBefore.get(`${raid.name}|${mode.difficulty}`);
      // A raid that was not in the list before is new to the list, not necessarily to the player.
      if (before !== undefined && mode.killed > before) {
        news.push({
          kind: 'raid',
          raid: raid.name,
          difficulty: mode.difficulty,
          killed: mode.killed,
          total: mode.total,
        });
      }
    }
  }

  const ratingBefore = new Map(
    (previous.pvp?.brackets ?? []).map((bracket) => [bracket.bracket, bracket.rating]),
  );
  for (const bracket of current.pvp?.brackets ?? []) {
    const before = ratingBefore.get(bracket.bracket);
    if (before !== undefined && bracket.rating > before) {
      news.push({ kind: 'pvp', bracket: bracket.bracket, from: before, to: bracket.rating });
    }
  }

  for (const what of COLLECTIONS) {
    const before = previous.collections[what];
    const now = current.collections[what];
    if (before !== null && now !== null && now > before) {
      news.push({ kind: 'collection', what, added: now - before, total: now });
    }
  }
  return news;
}
