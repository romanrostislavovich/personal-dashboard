/** Difference between a Steam ID64 and the 32-bit account id used by Dota. */
const STEAM_ID64_BASE = 76561197960265728n;

/** What the user pasted for a Steam profile: its id, or a custom name Steam has to resolve. */
export type SteamReference = { steamId: string } | { vanity: string };

/**
 * Reads a Steam profile from whatever the user pasted:
 * `76561198065514372`, `105248644` (the 32-bit account id),
 * `https://steamcommunity.com/profiles/7656…`, `https://steamcommunity.com/id/nickname`,
 * or just `nickname` — the custom address, which only the Steam API can turn into an id.
 */
export function parseSteamReference(input: string): SteamReference | null {
  const value = input.trim().replace(/\/+$/, '');
  const vanity = value.match(/steamcommunity\.com\/id\/([^/?#]+)/i)?.[1];
  if (vanity) {
    return { vanity: decodeURIComponent(vanity) };
  }
  const digits = value.match(/(?:profiles\/)?(\d{5,20})$/)?.[1];
  if (digits) {
    const id = BigInt(digits);
    const steamId = id > STEAM_ID64_BASE ? id : id + STEAM_ID64_BASE;
    return id > 0n && steamId < STEAM_ID64_BASE + 2n ** 32n ? { steamId: String(steamId) } : null;
  }
  // A bare custom name: letters, digits, `_` and `-`.
  return /^[\w-]{2,64}$/.test(value) ? { vanity: value } : null;
}

/** The Steam ID64 of a Dota account id (32-bit). */
export function toSteamId64(accountId: number | string): string {
  return String(BigInt(accountId) + STEAM_ID64_BASE);
}
