import {fetchWithTimeout} from '@pd/api-core';
import {WowAccountCharacter, WowAccountVersion, WowRegion} from '@pd/contracts';
import {LOCALES} from './battlenet.client';

/**
 * Signing in with a Battle.net account (OAuth authorization code, scope `wow.profile`) and the
 * list of its characters. One host serves every region except China; the token lasts about a
 * day and Blizzard gives no refresh token, so the sign-in is used to *find* characters, and
 * their data is read with the app's own keys as before.
 */
const OAUTH = 'https://oauth.battle.net';

/** The namespace part of each version, as in `battlenet.client.ts`, plus Forever. */
const ACCOUNT_NAMESPACES: Record<WowAccountVersion, string> = {
  retail: '',
  anniversary: 'classicann-',
  era: 'classic1x-',
  progression: 'classic-',
  forever: 'forever-',
};

export interface BattlenetUserToken {
  accessToken: string;
  expiresAt: Date;
}

export class BattlenetSignInError extends Error {}

export function authorizeUrl(
  clientId: string,
  redirectUri: string,
  state: string,
): string {
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'wow.profile',
    state,
  });
  return `${OAUTH}/authorize?${query}`;
}

export async function exchangeCode(
  keys: {clientId: string; clientSecret: string},
  code: string,
  redirectUri: string,
): Promise<BattlenetUserToken> {
  const response = await fetchWithTimeout(`${OAUTH}/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${keys.clientId}:${keys.clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!response.ok) {
    throw new BattlenetSignInError(
      `Battle.net sign-in ${response.status}: ${(await response.text()).slice(0, 200)}`,
    );
  }
  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

/** One answer of `/profile/user/wow`: its status and, when there is one, the body. */
export interface AccountProfileAnswer {
  region: WowRegion;
  version: WowAccountVersion;
  status: number;
  body: RawAccountProfile | null;
}

/** The account's characters in one region and version; 404 — none there. */
export async function fetchAccountProfile(
  accessToken: string,
  region: WowRegion,
  version: WowAccountVersion,
): Promise<AccountProfileAnswer> {
  const query = new URLSearchParams({
    namespace: `profile-${ACCOUNT_NAMESPACES[version]}${region}`,
    locale: LOCALES[region],
  });
  const response = await fetchWithTimeout(
    `https://${region}.api.blizzard.com/profile/user/wow?${query}`,
    {headers: {Authorization: `Bearer ${accessToken}`}},
  );
  return {
    region,
    version,
    status: response.status,
    body: response.ok ? ((await response.json()) as RawAccountProfile) : null,
  };
}

/** The characters of one answer, whatever fields Blizzard leaves out. */
export function parseAccountProfile(
  answer: AccountProfileAnswer,
): WowAccountCharacter[] {
  return (answer.body?.wow_accounts ?? []).flatMap(account =>
    (account.characters ?? [])
      .filter(raw => raw.name && typeof raw.id === 'number')
      .map(raw => ({
        id: raw.id as number,
        region: answer.region,
        version: answer.version,
        name: raw.name as string,
        surname: raw.surname?.trim() || null,
        realm: localized(raw.realm?.name),
        realmSlug: raw.realm?.slug ?? null,
        level: raw.level ?? 0,
        className: localized(raw.playable_class?.name),
      })),
  );
}

/** A name as one string: with a locale Blizzard gives a string, without — every language. */
function localized(
  name: string | Record<string, string> | undefined,
): string | null {
  if (!name) {
    return null;
  }
  return typeof name === 'string'
    ? name
    : (name['ru_RU'] ?? name['en_US'] ?? Object.values(name)[0] ?? null);
}

// --- The raw answer (only the fields we use; Forever adds the surname) ---

export interface RawAccountProfile {
  wow_accounts?: {
    id?: number;
    characters?: RawAccountCharacter[];
  }[];
}

export interface RawAccountCharacter {
  id?: number;
  name?: string;
  surname?: string;
  level?: number;
  realm?: {slug?: string; name?: string | Record<string, string>};
  playable_class?: {name?: string | Record<string, string>};
  protected_character?: {href?: string};
}
