/** Difference between a Steam ID64 and the 32-bit account id used by Dota/OpenDota. */
const STEAM_ID64_BASE = 76561197960265728n;

/**
 * Extracts the Dota account id from whatever the user pasted:
 * `105248644`, `76561198065514372`, `https://www.opendota.com/players/105248644`,
 * `https://www.dotabuff.com/players/105248644`, `https://steamcommunity.com/profiles/7656…`.
 * Short Steam links like /id/nickname cannot be resolved without the Steam Web API — returns null.
 */
export function parseDotaAccountId(input: string): number | null {
  const digits = input.trim().match(/(\d{5,20})(?!.*\d)/)?.[1];
  if (!digits) {
    return null;
  }
  const value = BigInt(digits);
  const accountId = value > STEAM_ID64_BASE ? value - STEAM_ID64_BASE : value;
  return accountId > 0n && accountId < 2n ** 32n ? Number(accountId) : null;
}

/**
 * Rank medal: `rank_tier` = medal × 10 + stars.
 * 1 Herald, 2 Guardian, 3 Crusader, 4 Archon, 5 Legend, 6 Ancient, 7 Divine, 8 Immortal.
 */
export function splitRankTier(rankTier: number | null): { medal: number; stars: number } | null {
  if (!rankTier) {
    return null;
  }
  return { medal: Math.floor(rankTier / 10), stars: rankTier % 10 };
}
