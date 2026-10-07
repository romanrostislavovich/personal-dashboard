/** A sync that was off for long would put weeks of play on one day: no day has more than this. */
const MAX_MINUTES_A_DAY = 24 * 60;

/**
 * What was played since the last sync: Steam tells only the total per game, so the growth of
 * it between two syncs is the play of that time. A game seen for the first time has no "before"
 * — its total is years of play, not today's.
 */
export function playedSince(
  before: ReadonlyMap<number, number>,
  games: { appId: number; playtimeMinutes: number }[],
): { appId: number; minutes: number }[] {
  const played: { appId: number; minutes: number }[] = [];
  for (const game of games) {
    const known = before.get(game.appId);
    if (known !== undefined && game.playtimeMinutes > known) {
      played.push({
        appId: game.appId,
        minutes: Math.min(game.playtimeMinutes - known, MAX_MINUTES_A_DAY),
      });
    }
  }
  return played;
}
