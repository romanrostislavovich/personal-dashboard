import { STEAM_HISTORY_LIMIT, SteamHistoryPage, SteamListedMatch } from './steam-dota.client';

/** One page of a query: all matches, or the matches on one hero, older than `beforeMatchId`. */
export type HistoryPageReader = (query: {
  beforeMatchId?: number;
  heroId?: number;
}) => Promise<SteamHistoryPage>;

/** A guard against an endless walk: 40 windows of 500 are 20,000 matches. */
const MAX_WINDOWS = 40;

/**
 * Every match of an account. Steam gives one query 500 matches at most, so past them the walk
 * tries two ways further:
 * 1. a new query that starts below the oldest match it has — window after window;
 * 2. if Steam gives nothing that way, hero by hero — each hero is a query of its own, and nobody
 *    has 500 matches on every hero. When Steam refuses the queries by hero, the walk stops at
 *    once: asking on only wastes its request limit.
 *
 * `save` gets the matches of every query as soon as it is read: the walk takes many requests,
 * and one of them failing must not lose what the others brought.
 */
export async function wholeHistory(
  readPage: HistoryPageReader,
  heroIds: () => Promise<number[]>,
  save: (matches: SteamListedMatch[]) => Promise<void> = async () => undefined,
): Promise<SteamListedMatch[]> {
  const byId = new Map<number, SteamListedMatch>();
  const keep = async (matches: SteamListedMatch[]) => {
    if (matches.length > 0) {
      await save(matches);
    }
    for (const match of matches) {
      byId.set(match.matchId, match);
    }
  };

  let window = await walk(readPage, {});
  await keep(window.matches);
  if (window.matches.length < STEAM_HISTORY_LIMIT) {
    return [...byId.values()];
  }

  // Way 1: the windows below the first one.
  let windows = 1;
  while (window.matches.length >= STEAM_HISTORY_LIMIT && windows < MAX_WINDOWS) {
    window = await walk(readPage, { beforeMatchId: oldest(window.matches) });
    await keep(window.matches);
    windows++;
  }
  if (windows > 2 || window.matches.length > 0) {
    return [...byId.values()];
  }

  // Way 2: Steam gave nothing below the first window.
  for (const heroId of await heroIds()) {
    const onHero = await walk(readPage, { heroId });
    if (onHero.refused) {
      break;
    }
    await keep(onHero.matches);
  }
  return [...byId.values()];
}

/** One query: its pages, the newest matches first, until Steam says there are no more. */
async function walk(
  readPage: HistoryPageReader,
  { beforeMatchId, heroId }: { beforeMatchId?: number; heroId?: number },
): Promise<{ matches: SteamListedMatch[]; refused: boolean }> {
  const matches: SteamListedMatch[] = [];
  for (;;) {
    const page = await readPage({ beforeMatchId, heroId });
    matches.push(...page.matches);
    if (!page.hasMore || page.matches.length === 0 || matches.length >= STEAM_HISTORY_LIMIT) {
      return { matches, refused: Boolean(page.refused) };
    }
    beforeMatchId = oldest(page.matches);
  }
}

function oldest(matches: SteamListedMatch[]): number {
  return Math.min(...matches.map((match) => match.matchId));
}
