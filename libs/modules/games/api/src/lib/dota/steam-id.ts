/** Разница между Steam ID64 и 32-битным account id, который использует Dota/OpenDota. */
const STEAM_ID64_BASE = 76561197960265728n;

/**
 * Достаёт Dota account id из того, что вставил пользователь:
 * `105248644`, `76561198065514372`, `https://www.opendota.com/players/105248644`,
 * `https://www.dotabuff.com/players/105248644`, `https://steamcommunity.com/profiles/7656…`.
 * Короткие ссылки Steam вида /id/nickname без Steam Web API не разрешить — вернём null.
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
 * Медаль ранга: `rank_tier` = медаль × 10 + звёзды.
 * 1 Herald, 2 Guardian, 3 Crusader, 4 Archon, 5 Legend, 6 Ancient, 7 Divine, 8 Immortal.
 */
export function splitRankTier(rankTier: number | null): { medal: number; stars: number } | null {
  if (!rankTier) {
    return null;
  }
  return { medal: Math.floor(rankTier / 10), stars: rankTier % 10 };
}
