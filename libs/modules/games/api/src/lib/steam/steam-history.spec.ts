import { SteamListedMatch } from './steam-dota.client';
import { HistoryPageReader, wholeHistory } from './steam-history';

const PAGE = 100;

/** A fake account: `heroes[i]` matches on hero `i + 1`, ids growing with time. */
function account(heroes: number[]) {
  const matches: SteamListedMatch[] = [];
  heroes.forEach((count, index) => {
    for (let n = 0; n < count; n++) {
      matches.push({
        matchId: matches.length + 1,
        heroId: index + 1,
        startedAt: new Date(0),
        lobbyType: 0,
      });
    }
  });
  const queries: string[] = [];
  const readPage: HistoryPageReader = async ({ beforeMatchId, heroId }) => {
    queries.push(`${heroId ?? 'all'}:${beforeMatchId ?? 'newest'}`);
    // Like Steam: newest first, a query never reaches past its 500 newest matches.
    const visible = matches
      .filter((match) => !heroId || match.heroId === heroId)
      .sort((a, b) => b.matchId - a.matchId)
      .slice(0, 500);
    const rest = visible.filter((match) => !beforeMatchId || match.matchId < beforeMatchId);
    return { matches: rest.slice(0, PAGE), hasMore: rest.length > PAGE };
  };
  return { matches, queries, readPage, heroIds: async () => heroes.map((_, index) => index + 1) };
}

describe('wholeHistory', () => {
  it('reads a short history with one query, page by page', async () => {
    const { readPage, heroIds, queries } = account([150, 80]);
    const history = await wholeHistory(readPage, heroIds);
    expect(history).toHaveLength(230);
    expect(queries).toEqual(['all:newest', 'all:131', 'all:31']);
  });

  it('goes hero by hero when the history is longer than a query gives', async () => {
    const { readPage, heroIds, matches } = account([700, 300, 40]);
    const history = await wholeHistory(readPage, heroIds);
    // 500 of the 700 on the first hero are reachable, the other two heroes are complete.
    expect(history).toHaveLength(500 + 300 + 40);
    expect(new Set(history.map((match) => match.matchId)).size).toBe(history.length);
    expect(history.length).toBeLessThan(matches.length);
  });

  it('gives nothing for an account without matches', async () => {
    const { readPage, heroIds } = account([]);
    expect(await wholeHistory(readPage, heroIds)).toEqual([]);
  });
});
