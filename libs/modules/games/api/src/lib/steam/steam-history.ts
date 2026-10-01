import { STEAM_HISTORY_LIMIT, SteamHistoryPage, SteamListedMatch } from './steam-dota.client';

/** One page of a query: all matches, or the matches on one hero, older than `beforeMatchId`. */
export type HistoryPageReader = (query: {
  beforeMatchId?: number;
  heroId?: number;
}) => Promise<SteamHistoryPage>;

/**
 * Every match of an account. Steam gives one query 500 matches at most, however it is paged,
 * so a history that long is walked again hero by hero — each hero is a query of its own, and
 * nobody has 500 matches on every hero.
 */
export async function wholeHistory(
  readPage: HistoryPageReader,
  heroIds: () => Promise<number[]>,
): Promise<SteamListedMatch[]> {
  const all = await walk(readPage);
  if (all.length < STEAM_HISTORY_LIMIT) {
    return all;
  }
  const byId = new Map(all.map((match) => [match.matchId, match]));
  for (const heroId of await heroIds()) {
    for (const match of await walk(readPage, heroId)) {
      byId.set(match.matchId, match);
    }
  }
  return [...byId.values()];
}

/** All pages of one query: the newest matches first, each page continuing the previous one. */
async function walk(readPage: HistoryPageReader, heroId?: number): Promise<SteamListedMatch[]> {
  const matches: SteamListedMatch[] = [];
  let beforeMatchId: number | undefined;
  for (;;) {
    const page = await readPage({ beforeMatchId, heroId });
    matches.push(...page.matches);
    if (!page.hasMore || page.matches.length === 0 || matches.length >= STEAM_HISTORY_LIMIT) {
      return matches;
    }
    beforeMatchId = Math.min(...page.matches.map((match) => match.matchId));
  }
}
