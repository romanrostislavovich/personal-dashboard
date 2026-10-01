import { DOTA_MATCH_MODES, dotaMatchMode, DotaMatchMode, DotaModeStats } from '@pd/contracts';

interface Counts {
  matches: number;
  decided: number;
  wins: number;
}

/**
 * Rows grouped by OpenDota's game mode and lobby type → the modes a player thinks of
 * (the grouping itself lives in contracts, `dotaMatchMode`); modes without matches are left out.
 */
export function sumByMode(
  rows: ({ gameMode: number | null; lobbyType: number | null } & Counts)[],
): DotaModeStats[] {
  const byMode = new Map<DotaMatchMode, Counts>();
  for (const row of rows) {
    const mode = dotaMatchMode(row.gameMode, row.lobbyType);
    const total = byMode.get(mode) ?? { matches: 0, decided: 0, wins: 0 };
    byMode.set(mode, {
      matches: total.matches + row.matches,
      decided: total.decided + row.decided,
      wins: total.wins + row.wins,
    });
  }
  return DOTA_MATCH_MODES.flatMap((mode) => {
    const total = byMode.get(mode);
    return total ? [{ mode, ...total }] : [];
  });
}
